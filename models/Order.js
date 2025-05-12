const mongoose = require("mongoose")

const OrderItemSchema = new mongoose.Schema({
  book: {
    type: mongoose.Schema.ObjectId,
    ref: "Book",
    required: true,
  },
  title: String,
  author: String,
  coverImage: String,
  quantity: {
    type: Number,
    required: true,
    min: [1, "Quantity cannot be less than 1"],
  },
  price: {
    type: Number,
    required: true,
  },
  seller: {
    type: mongoose.Schema.ObjectId,
    ref: "User",
    required: true,
  }
})

const OrderSchema = new mongoose.Schema({
  buyer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  orderId: {
    type: String,
    required: true,
    unique: true,
  },
  orderDate: {
    type: Date,
    default: Date.now,
  },
  items: [OrderItemSchema],
  totalAmount: {
    type: Number,
    required: true,
  },
  paymentMethod: {
    type: String,
    required: true,
    enum: ["credit_card", "debit_card", "upi", "net_banking", "cash_on_delivery"],
  },
  paymentStatus: {
    type: String,
    enum: ["pending", "completed", "failed", "refunded"],
    default: "pending",
  },
  shippingAddress: {
    name: {
      type: String,
      required: true,
    },
    address: {
      type: String,
      required: true,
    },
    city: {
      type: String,
      required: true,
    },
    state: {
      type: String,
      required: true,
    },
    pincode: {
      type: String,
      required: true,
    },
    phone: {
      type: String,
      required: true,
    }
  },
  orderStatus: {
    type: String,
    enum: ["ordered", "processing", "shipped", "delivered", "cancelled"],
    default: "ordered",
  },
  trackingNumber: String,
  deliveryDate: Date,
  lastStatusUpdate: {
    type: Date,
    default: Date.now,
  },
  status: {
    type: String,
    enum: ['processing', 'shipped', 'delivered', 'cancelled'],
    default: 'processing'
  },
  expectedDelivery: {
    type: Date,
    default: null
  },
  adminNotes: {
    type: String,
    trim: true
  },
  trackingInfo: {
    carrier: String,
    trackingNumber: String,
    trackingUrl: String
  },
  statusHistory: [{
    status: String,
    date: {
      type: Date,
      default: Date.now
    },
    note: String
  }]
})

// Generate orderId before saving
OrderSchema.pre("save", async function(next) {
  try {
    if (!this.orderId) {
      const date = new Date();
      const year = date.getFullYear().toString().slice(-2);
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const day = date.getDate().toString().padStart(2, '0');
      const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
      this.orderId = `ORD${year}${month}${day}${random}`;
    }

    // Calculate delivery date (3-10 days from order date)
    if (!this.deliveryDate) {
      const deliveryDays = Math.floor(Math.random() * (10 - 3 + 1)) + 3; // Random between 3 and 10
      const deliveryDate = new Date(this.orderDate);
      deliveryDate.setDate(deliveryDate.getDate() + deliveryDays);
      this.deliveryDate = deliveryDate;
    }
    
    next();
  } catch (error) {
    next(error);
  }
});

// Add a pre-save hook to track status changes
OrderSchema.pre('save', function(next) {
  // If this is new or the status has changed
  if (this.isNew || this.isModified('status')) {
    this.statusHistory.push({
      status: this.status,
      date: Date.now()
    });
  }
  next();
});

module.exports = mongoose.model("Order", OrderSchema)