const { body, validationResult } = require('express-validator');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) {
    return next();
  }
  return res.status(400).json({ error: errors.array()[0].msg });
};

const registerValidation = [
  body('email').isEmail().withMessage('Please provide a valid email address'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number and one special character'),
  body('name').notEmpty().withMessage('Full name is required'),
  body('company_name').notEmpty().withMessage('Company name is required'),
  validate
];

const loginValidation = [
  // Login accepts either an email address or a staff ID (employee_code),
  // so this can't require .isEmail() — it only rejects a blank identifier.
  body('email').trim().notEmpty().withMessage('Please provide your email or staff ID'),
  body('password').notEmpty().withMessage('Password is required'),
  validate
];

module.exports = {
  registerValidation,
  loginValidation
};
