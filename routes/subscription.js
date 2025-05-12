const express = require("express");
const router = express.Router();
const Subscription = require("../models/Subscription");
const User = require("../models/User");
const { ensureAuthenticated } = require("../middleware/auth");
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Middleware to check subscription status
const hasActiveSubscription = async (req, res, next) => {
  try {
    const subscription = await Subscription.findOne({
      user: req.user._id,
      isActive: true,
      endDate: { $gt: new Date() }
    });
    
    if (subscription && (subscription.plan === "premium" || subscription.plan === "premium_plus")) {
      req.subscription = subscription;
      return next();
    }
    
    req.flash("error_msg", "You need an active subscription to access this feature");
    return res.redirect("/subscription/plans");
  } catch (err) {
    console.error(err);
    req.flash("error_msg", "Error checking subscription status");
    return res.redirect("/");
  }
};

/**
 * @route   GET /subscription/plans
 * @desc    View subscription plans (redirects to pricing page)
 * @access  Private
 */
router.get("/plans", ensureAuthenticated, (req, res) => {
  res.redirect("/pricing");
});

/**
 * @route   GET /subscription/checkout/:plan
 * @desc    Checkout page for subscription
 * @access  Private
 */
router.get("/checkout/:plan", ensureAuthenticated, async (req, res) => {
  const { plan } = req.params;
  
  // Validate plan
  if (!["premium", "premium_plus"].includes(plan)) {
    req.flash("error_msg", "Invalid subscription plan");
    return res.redirect("/pricing");
  }
  
  // Determine plan price and details
  const planDetails = {
    premium: {
      name: "Premium",
      price: 199,
      interval: "month",
      features: [
        "Access to e-books and audiobooks",
        "Advanced recommendation system",
        "Priority delivery",
        "Exclusive discounts"
      ]
    },
    premium_plus: {
      name: "Premium Plus",
      price: 499,
      interval: "month",
      features: [
        "Unlimited e-book access",
        "Monthly free physical book",
        "Free express delivery",
        "Early access to new releases"
      ]
    }
  };
  
  res.render("subscription/checkout", {
    title: `Subscribe to ${planDetails[plan].name} - Bookish`,
    user: req.user,
    plan: planDetails[plan],
    planId: plan,
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY
  });
});

/**
 * @route   POST /subscription/create-subscription-session
 * @desc    Create a subscription checkout session with Stripe
 * @access  Private
 */
router.post("/create-subscription-session", ensureAuthenticated, async (req, res) => {
   
  try {
    const { planId } = req.body;
    
    // Determine price ID based on plan
    // Determine price ID based on plan
let priceId;
switch(planId) {
  case "premium":
    priceId = process.env.STRIPE_PREMIUM_PRICE_ID;
    break;
  case "premium_plus":
    priceId = process.env.STRIPE_PREMIUM_PLUS_PRICE_ID;
    break;
  default:
    return res.status(400).json({ success: false, message: "Invalid plan" });
}
    
    // Check if user already has a Stripe customer ID
    let customer;
    let existingSubscription = await Subscription.findOne({ user: req.user._id });
    
    if (existingSubscription && existingSubscription.stripeCustomerId) {
      customer = existingSubscription.stripeCustomerId;
    } else {
      // Create a new customer
      const customerData = await stripe.customers.create({
        email: req.user.email,
        name: req.user.name,
        metadata: {
          userId: req.user._id.toString()
        }
      });
      customer = customerData.id;
    }
    
    // Create the subscription
    const session = await stripe.checkout.sessions.create({
      customer: customer,
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${req.protocol}://${req.get('host')}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.protocol}://${req.get('host')}/pricing`,
      metadata: {
        userId: req.user._id.toString(),
        planId: planId
      }
    });
    
    res.json({ success: true, sessionId: session.id });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route   GET /subscription/success
 * @desc    Subscription success page
 * @access  Private
 */
router.get("/success", ensureAuthenticated, async (req, res) => {
  try {
    const { session_id } = req.query;
    
    if (!session_id) {
      req.flash("error_msg", "Invalid session");
      return res.redirect("/pricing");
    }
    
    // Retrieve the session to get subscription details
    const session = await stripe.checkout.sessions.retrieve(session_id);
    
    if (!session) {
      req.flash("error_msg", "Session not found");
      return res.redirect("/pricing");
    }
    
    const planId = session.metadata.planId;
    
    // Get subscription from Stripe
    const subscription = await stripe.subscriptions.retrieve(session.subscription);
    
    // Calculate subscription end date (1 month from now)
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + 1);
    
    // Save subscription to database
    let userSubscription = await Subscription.findOne({ user: req.user._id });
    
    if (userSubscription) {
      // Update existing subscription
      userSubscription.plan = planId;
      userSubscription.startDate = new Date();
      userSubscription.endDate = endDate;
      userSubscription.renewalDate = endDate;
      userSubscription.isActive = true;
      userSubscription.stripeSubscriptionId = subscription.id;
      userSubscription.stripeCustomerId = session.customer;
      userSubscription.paymentDetails = {
        paymentId: session.payment_intent,
        amount: subscription.items.data[0].price.unit_amount / 100,
        status: 'completed'
      };
    } else {
      // Create new subscription
      userSubscription = new Subscription({
        user: req.user._id,
        plan: planId,
        startDate: new Date(),
        endDate: endDate,
        renewalDate: endDate,
        isActive: true,
        stripeSubscriptionId: subscription.id,
        stripeCustomerId: session.customer,
        paymentDetails: {
          paymentId: session.payment_intent,
          amount: subscription.items.data[0].price.unit_amount / 100,
          status: 'completed'
        }
      });
    }
    
    await userSubscription.save();
    
    req.flash("success_msg", "Your subscription has been successfully activated!");
    res.render("subscription/success", {
      title: "Subscription Success - Bookish",
      user: req.user,
      subscription: userSubscription,
      planName: planId === "premium" ? "Premium" : "Premium Plus"
    });
  } catch (error) {
    console.error(error);
    req.flash("error_msg", "Error activating subscription");
    res.redirect("/pricing");
  }
});

module.exports = { router, hasActiveSubscription };