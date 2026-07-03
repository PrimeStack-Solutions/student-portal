// Check if a user is logged in
function isAuthenticated(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  res.redirect('/login');
}

// Check if the logged-in user has one of the allowed roles
function authorize(...roles) {
  return (req, res, next) => {
    if (!req.session || !req.session.user) {
      return res.redirect('/login');
    }
    if (!roles.includes(req.session.user.role)) {
      return res.status(403).render('forbidden', { user: req.session.user });
    }
    next();
  };
}

module.exports = { isAuthenticated, authorize };