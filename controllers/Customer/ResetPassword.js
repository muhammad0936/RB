const nodemailer = require('nodemailer');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const Customer = require('../../models/Customer');

exports.requestPasswordReset = async (req, res, next) => {
  let customer; // Declare customer here for error handling scope
  try {
    const { email } = req.body;

    // Validate email
    if (!email || typeof email !== 'string') {
      const error = new Error('Valid email is required');
      error.statusCode = 422;
      throw error;
    }

    customer = await Customer.findOne({ email });
    if (!customer) {
      return res.status(200).json({
        message: 'If the email exists, a reset code will be sent',
      });
    }

    // Generate 6-digit numeric code
    const resetToken = crypto.randomInt(100000, 999999).toString();
    const resetTokenExpiration = Date.now() + 3600000; // 1 hour

    // Save token and expiration
    customer.resetToken = resetToken;
    customer.resetTokenExpiration = resetTokenExpiration;
    await customer.save();

    // // Create Nodemailer transporter
    let transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.MAIL_USERNAME,
        pass: process.env.MAIL_PASSWORD,
      },
    });

    // Create test email transporter
    // const testAccount = await nodemailer.createTestAccount();
    // const transporter = nodemailer.createTransport({
    //   host: 'smtp.ethereal.email',
    //   port: 587,
    //   secure: false,
    //   auth: {
    //     user: testAccount.user,
    //     pass: testAccount.pass,
    //   },
    // });

    // Email content
    const mailOptions = {
      from: '"Password Recovery" <noreply@example.com>',
      to: email,
      subject: 'Your Password Reset Code',
      html: `
        <h2>Password Reset Code</h2>
        <p>Your password reset code is:</p>
        <div style="
          font-size: 24px;
          letter-spacing: 2px;
          padding: 10px;
          background: #f5f5f5;
          display: inline-block;
          margin: 20px 0;
        ">
          ${resetToken}
        </div>
        <p>This code will expire in 1 hour.</p>
        <p>Visit our <a href="${process.env.CLIENT_URL}/reset-password">password reset page</a> 
        and enter this code to proceed.</p>
      `,
    };

    // Send email
    const info = await transporter.sendMail(mailOptions);
    res.status(200).json({
      message: 'If the email exists, a reset code will be sent',
    });
  } catch (err) {
    // Clear reset token if email failed to send
    if (customer) {
      customer.resetToken = undefined;
      customer.resetTokenExpiration = undefined;
      await customer.save();
    }

    if (!err.statusCode) err.statusCode = 500;
    next(err);
  }
};

exports.resetPassword = async (req, res, next) => {
  try {
    const { token, newPassword } = req.body;

    // Validate inputs
    if (!token || !newPassword) {
      const error = new Error('Reset code and new password are required');
      error.statusCode = 422;
      throw error;
    }

    // Find customer by valid token and check expiration
    const customer = await Customer.findOne({
      resetToken: token,
      resetTokenExpiration: { $gt: Date.now() },
    });

    if (!customer) {
      const error = new Error('Invalid or expired reset code');
      error.statusCode = 400;
      throw error;
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Update customer and clear reset fields
    customer.password = hashedPassword;
    customer.resetToken = undefined;
    customer.resetTokenExpiration = undefined;
    await customer.save();

    res.status(200).json({ message: 'Password reset successful' });
  } catch (err) {
    if (!err.statusCode) err.statusCode = 500;
    next(err);
  }
};
// Reset password with valid token
exports.resetPassword = async (req, res, next) => {
  try {
    const { token, newPassword } = req.body;

    // Validate inputs
    if (!token || !newPassword) {
      const error = new Error('Token and new password are required');
      error.statusCode = 422;
      throw error;
    }

    // Find customer by valid, non-expired token
    const customer = await Customer.findOne({
      resetToken: token,
      resetTokenExpiration: { $gt: Date.now() },
    });

    if (!customer) {
      const error = new Error('Invalid or expired reset token');
      error.statusCode = 400;
      throw error;
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Update customer document
    customer.password = hashedPassword;
    customer.resetToken = undefined;
    customer.resetTokenExpiration = undefined;
    await customer.save();

    res.status(200).json({ message: 'Password reset successful' });
  } catch (err) {
    if (!err.statusCode) err.statusCode = 500;
    next(err);
  }
};
