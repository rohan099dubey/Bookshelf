/**
 * Authentication middleware for role-based access control
 */

/**
 * Ensures user is authenticated
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
module.exports.ensureAuthenticated = function(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  req.flash('alert', 'Please log in to view this resource');
  res.redirect('/auth/login');
};

/**
 * Ensures user has buyer role
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
module.exports.ensureBuyer = function(req, res, next) {
  if (req.isAuthenticated() && req.user.role === 'buyer') {
    return next();
  }
  req.flash('error_msg', 'Access denied. This page is only for buyers.');
  res.redirect('/dashboard');
};

/**
 * Ensures user has seller role
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
module.exports.ensureSeller = function(req, res, next) {
  if (req.isAuthenticated() && req.user.role === 'seller') {
    return next();
  }
  req.flash('error_msg', 'Access denied. This page is only for sellers.');
  res.redirect('/dashboard');
};

/**
 * Ensures user has admin role
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
module.exports.ensureAdmin = function(req, res, next) {
  if (req.isAuthenticated() && req.user.role === 'admin') {
    return next();
  }
  req.flash('error_msg', 'Access denied. This page is only for admins.');
  res.redirect('/dashboard');
};

/**
 * Forwards authenticated users away from the login page
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
module.exports.forwardAuthenticated = function(req, res, next) {
  if (!req.isAuthenticated()) {
    return next();
  }
  res.redirect('/dashboard');
};

