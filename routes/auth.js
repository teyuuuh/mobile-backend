import { Router } from 'express';
const router = Router();
import User from '../models/User.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import sendEmail from '../services/emailService.js';
import authenticateToken from '../middleware/auth.js';

const API_BASE_URL = 'https://mobile-backend-aftl.onrender.com';

// In your auth refresh endpoint
router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(401).json({ error: 'Refresh token required' });
  }

  try {
    const decoded = jwt.verify(refreshToken, process.env.REFRESH_SECRET);
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Generate new tokens
    const authToken = jwt.sign(
      { id: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    const newRefreshToken = jwt.sign(
      { id: user._id },
      process.env.REFRESH_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      authToken, // Changed from 'token' to 'authToken'
      refreshToken: newRefreshToken
    });
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(401).json({
      success: false,
      error: 'Invalid refresh token'
    });
  }
});

// Input validation middleware
const validateRegisterInput = (req, res, next) => {
  const requiredFields = [
    'firstName', 'lastName', 'studentID',
    'email', 'phone', 'dob',
    'password', 'confirmPassword', 'course',
    'yearLevel', 'department'
  ];

  const missingFields = requiredFields.filter(field => !req.body[field]);
  if (missingFields.length > 0) {
    return res.status(400).json({
      error: `Missing required fields: ${missingFields.join(', ')}`
    });
  }

  if (req.body.password !== req.body.confirmPassword) {
    return res.status(400).json({ error: 'Password and confirmation do not match' });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(req.body.email)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }

  if (req.body.password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters long' });
  }

  next();
};

// FIXED REGISTRATION ROUTE:
router.post('/register', validateRegisterInput, async (req, res) => {
  try {
    const {
      firstName, middleName, lastName, studentID, email, phone, dob,
      password, course, department, yearLevel,
    } = req.body;

    // Check if user exists
    const existingUser = await User.findOne({ $or: [{ studentID }, { email }] });
    if (existingUser) {
      return res.status(400).json({ error: 'Student ID or Email already exists' });
    }

    // Generate verification token
    const verificationToken = crypto.randomBytes(20).toString('hex');
    const verificationTokenExpires = Date.now() + 24 * 3600 * 1000;

    // Create user - DON'T hash password here, let pre-save hook do it
    const user = new User({
      firstName,
      middleName,
      lastName,
      studentID,
      email,
      phone,
      dob,
      password, // Raw password - will be hashed by pre-save hook
      course,
      department,
      yearLevel,
      isVerified: false,
      verificationToken,
      verificationTokenExpires
    });

    await user.save(); // Pre-save hook will hash the password


    const fullName = `${firstName} ${middleName ? middleName + ' ' : ''}${lastName}`.trim();
    const emailSent = await sendEmail(email, 1, {
      name: fullName,
      token: verificationToken,
      studentId: studentID
    });

    if (!emailSent) {
      await User.deleteOne({ _id: user._id });
      return res.status(500).json({
        error: 'Failed to send verification email. Please try again later.'
      });
    }

    res.status(201).json({
      message: 'Registration successful. Verification email sent.',
      user: {
        _id: user._id,
        firstName: user.firstName,
        middleName: user.middleName,
        lastName: user.lastName,
        studentID: user.studentID,
        email: user.email,
        phone: user.phone,
        course: user.course,
        department: user.department,
        yearLevel: user.yearLevel,
      }
    });

  } catch (error) {
    console.error('[REGISTER] Error:', error);
    const statusCode = error.message.includes('validation') ? 400 : 500;
    const errorMessage = error.code === 11000
      ? 'Registration conflict. Please try again.'
      : 'Registration failed: ' + error.message;

    res.status(statusCode).json({
      error: errorMessage,
      ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
    });
  }
});

// Enhanced login route with detailed logging
router.post('/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;

    console.log('=== LOGIN ATTEMPT ===');
    console.log('Identifier received:', identifier);
    console.log('Password received:', password ? '[PRESENT]' : '[MISSING]');

    if (!identifier || !password) {
      console.log('Missing required fields');
      return res.status(400).json({
        success: false,
        error: 'Identifier and password are required'
      });
    }

    // Clean the identifier
    const cleanIdentifier = identifier.toLowerCase().trim();
    console.log('Clean identifier:', cleanIdentifier);

    // Find user by email OR studentID with detailed logging
    console.log('Searching for user with query:', {
      $or: [
        { email: cleanIdentifier },
        { studentID: identifier.trim() } // Keep original case for studentID
      ]
    });

    const user = await User.findOne({
      $or: [
        { email: cleanIdentifier },
        { studentID: identifier.trim() }
      ]
    }).select('+password +isVerified +verificationToken +verificationTokenExpires');

    console.log('User found:', user ? 'YES' : 'NO');

    if (user) {
      console.log('User details:', {
        _id: user._id,
        email: user.email,
        studentID: user.studentID,
        isVerified: user.isVerified,
        hasPassword: !!user.password
      });
    }

    if (!user) {
      console.log('No user found - Invalid credentials');
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // Password comparison with logging
    console.log('Comparing passwords...');
    console.log('Stored password hash:', user.password ? '[PRESENT]' : '[MISSING]');

    if (!user.password) {
      console.log('User has no password set');
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials',
        code: 'INVALID_CREDENTIALS'
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    console.log('Password match:', isMatch);

    if (!isMatch) {
      console.log('Password mismatch - Invalid credentials');
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials',
        code: 'INVALID_CREDENTIALS'
      });
    }

    console.log('Password verification successful');

    // Check if email is verified
    if (!user.isVerified) {
      console.log('User email not verified');
      const tokenExpired = !user.verificationToken ||
        user.verificationTokenExpires < Date.now();

      if (tokenExpired) {
        console.log('Verification token expired, generating new one');
        // Generate new token
        user.verificationToken = crypto.randomBytes(20).toString('hex');
        user.verificationTokenExpires = Date.now() + 24 * 3600 * 1000;
        await user.save();

        // Send verification email
        const fullName = `${user.firstName} ${user.middleName ? user.middleName + ' ' : ''}${user.lastName}`.trim();
        const emailSent = await sendEmail(user.email, 1, {
          name: fullName,
          token: user.verificationToken,
          studentId: user.studentID
        });

        console.log('New verification email sent:', emailSent);
      }

      return res.status(403).json({
        success: false,
        error: tokenExpired
          ? 'Verification expired. New email sent.'
          : 'Email not verified',
        requiresVerification: true,
        email: user.email,
        canResend: !tokenExpired,
        code: 'EMAIL_NOT_VERIFIED'
      });
    }

    console.log('User is verified, generating OTP');

    // For verified users, generate and send OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.otp = otp;
    user.otpExpires = Date.now() + 15 * 60 * 1000; // 15 minutes
    await user.save();

    console.log('OTP generated and saved:', otp);

    // Send OTP email
    const fullName = `${user.firstName} ${user.middleName ? user.middleName + ' ' : ''}${user.lastName}`.trim();
    const emailSent = await sendEmail(user.email, 2, {
      name: fullName,
      otp: otp,
      ipAddress: req.ip || 'Unknown'
    });

    console.log('OTP email sent:', emailSent);

    if (!emailSent) {
      console.log('Failed to send OTP email');
      return res.status(500).json({
        success: false,
        error: 'Failed to send OTP. Please try again.',
        code: 'EMAIL_SEND_FAILED'
      });
    }

    console.log('=== LOGIN SUCCESS - OTP SENT ===');

    // Return success with OTP requirement
    return res.json({
      success: true,
      message: 'OTP sent to your email',
      requiresOTP: true,
      email: user.email,
      code: 'OTP_SENT'
    });

  } catch (error) {
    console.error('=== LOGIN ERROR ===');
    console.error('Error details:', error);
    console.error('Stack trace:', error.stack);

    return res.status(500).json({
      success: false,
      error: 'Authentication server error',
      code: 'SERVER_ERROR'
    });
  }
});

// Verify Email - UPDATED to handle both web browser and app requests
router.get('/verify-email', async (req, res) => {
  try {
    const { token, email } = req.query;

    // Find user with valid token
    const user = await User.findOne({
      verificationToken: token,
      verificationTokenExpires: { $gt: Date.now() }
    });

    if (!user) {
      // Invalid/expired token - show error page with app redirect
      return res.status(400).send(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Email Verification - MANTRAklatan</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
              body { 
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
                text-align: center; 
                padding: 20px; 
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                margin: 0;
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
              }
              .container { 
                max-width: 400px; 
                background: white; 
                padding: 40px 30px; 
                border-radius: 15px; 
                box-shadow: 0 10px 30px rgba(0,0,0,0.2);
              }
              .logo { width: 80px; height: 80px; margin: 0 auto 20px; background: #ff6b6b; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-size: 30px; }
              h1 { color: #333; margin: 0 0 10px; font-size: 24px; }
              .error { color: #ff6b6b; margin: 20px 0; }
              .button { 
                display: inline-block; 
                padding: 12px 30px; 
                background: #1993d4; 
                color: white; 
                text-decoration: none; 
                border-radius: 25px; 
                margin: 10px 5px; 
                font-weight: 500;
                transition: all 0.3s ease;
              }
              .button:hover { background: #147ba8; transform: translateY(-2px); }
              .secondary { background: #6c757d; }
              .secondary:hover { background: #545b62; }
              p { color: #666; line-height: 1.5; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="logo">✗</div>
              <h1>Verification Failed</h1>
              <p class="error">This verification link is invalid, expired, or has already been used.</p>
              <p>If you have the MANTRAklatan app installed, tap the button below to open it:</p>
              <a href="mantraklatan://verify-email?error=invalid_token" class="button">Open MANTRAklatan App</a>
              <br>
              <p style="font-size: 14px; margin-top: 20px;">You can also request a new verification email from within the app.</p>
            </div>
          </body>
          </html>
        `);
    }

    // Valid token - verify the user
    user.isVerified = true;
    user.verificationToken = undefined;
    user.verificationTokenExpires = undefined;
    await user.save();

    // Success page with app redirect
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Email Verified - MANTRAklatan</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
              text-align: center; 
              padding: 20px; 
              background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
              margin: 0;
              min-height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
            }
            .container { 
              max-width: 400px; 
              background: white; 
              padding: 40px 30px; 
              border-radius: 15px; 
              box-shadow: 0 10px 30px rgba(0,0,0,0.2);
            }
            .logo { width: 80px; height: 80px; margin: 0 auto 20px; background: #4caf50; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-size: 30px; }
            h1 { color: #333; margin: 0 0 10px; font-size: 24px; }
            .success { color: #4caf50; margin: 20px 0; font-weight: 500; }
            .button { 
              display: inline-block; 
              padding: 12px 30px; 
              background: #1993d4; 
              color: white; 
              text-decoration: none; 
              border-radius: 25px; 
              margin: 10px 5px; 
              font-weight: 500;
              transition: all 0.3s ease;
            }
            .button:hover { background: #147ba8; transform: translateY(-2px); }
            .countdown { margin: 20px 0; font-size: 14px; color: #666; }
            p { color: #666; line-height: 1.5; }
          </style>
          <script>
            let countdown = 5;
            function updateCountdown() {
              const element = document.getElementById('countdown');
              if (element) {
                element.textContent = countdown;
                if (countdown > 0) {
                  countdown--;
                  setTimeout(updateCountdown, 1000);
                } else {
                  // Try to open the app
                  window.location.href = 'mantraklatan://verify-email?success=true&email=${encodeURIComponent(user.email)}';
                  // Fallback message
                  setTimeout(() => {
                    document.getElementById('message').innerHTML = 
                      '<p>If the app didn\\'t open automatically, please open the MANTRAklatan app manually.</p>';
                  }, 2000);
                }
              }
            }
            // Start countdown when page loads
            document.addEventListener('DOMContentLoaded', updateCountdown);
          </script>
        </head>
        <body>
          <div class="container">
            <div class="logo">✓</div>
            <h1>Email Verified!</h1>
            <p class="success">Your email has been successfully verified.</p>
            <p>Welcome to MANTRAklatan! You can now log in to your account.</p>
            
            <div class="countdown">
              Opening app in <span id="countdown">5</span> seconds...
            </div>
            
            <div id="message">
              <a href="mantraklatan://verify-email?success=true&email=${encodeURIComponent(user.email)}" class="button">
                Open MANTRAklatan App
              </a>
            </div>
            
            <p style="font-size: 14px; margin-top: 20px;">
              If the app doesn't open, please open it manually and try logging in.
            </p>
          </div>
        </body>
        </html>
      `);

  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Verification Error - MANTRAklatan</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
            .container { max-width: 400px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; }
            .error { color: #ff6b6b; }
          </style>
        </head>
        <body>
          <div class="container">
            <h2>Verification Error</h2>
            <p class="error">An error occurred during verification. Please try again later.</p>
            <a href="mantraklatan://verify-email?error=server_error">Open MANTRAklatan App</a>
          </div>
        </body>
        </html>
      `);
  }
});

// API endpoint for checking verification status (for React Native app)
router.post('/check-verification-status', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    res.json({
      success: true,
      isVerified: user.isVerified,
      email: user.email
    });
  } catch (error) {
    console.error('Check verification status error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
});

router.get('/verify-token', authenticateToken, async (req, res) => {
  try {
    res.json({ valid: true, user: req.user });
  } catch (error) {
    res.status(401).json({ valid: false, error: 'Invalid token' });
  }
});

// Verify OTP - Updated to return proper JWT token
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        error: 'Email and OTP are required'
      });
    }

    const user = await User.findOne({
      email: email.toLowerCase(),
      otp,
      otpExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired OTP'
      });
    }

    // Clear OTP and generate JWT
    user.otp = undefined;
    user.otpExpires = undefined;
    user.lastLogin = new Date();
    user.loginCount = (user.loginCount || 0) + 1;
    await user.save();

    // Generate JWT token
    const authToken = jwt.sign(
      {
        userId: user._id,
        email: user.email,
        role: user.role
      },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    // Return user data without password
    const userData = {
      _id: user._id,
      firstName: user.firstName,
      middleName: user.middleName,
      lastName: user.lastName,
      studentID: user.studentID,
      email: user.email,
      phone: user.phone,
      course: user.course,
      department: user.department,
      yearLevel: user.yearLevel,
      role: user.role,
      isVerified: user.isVerified
    };

    res.json({
      success: true,
      message: 'OTP verified successfully',
      authToken,
      user: userData
    });

  } catch (error) {
    console.error('OTP verification error:', error);
    res.status(500).json({
      success: false,
      error: 'OTP verification failed. Please try again.'
    });
  }
});

// Resend Verification Email - FIXED
router.post('/resend-verification', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    if (user.isVerified) {
      return res.status(400).json({
        success: false,
        error: 'Email already verified'
      });
    }

    // Generate new token
    user.verificationToken = crypto.randomBytes(20).toString('hex');
    user.verificationTokenExpires = Date.now() + 24 * 3600 * 1000;
    await user.save();

    // Send verification email with correct parameters
    const emailSent = await sendEmail(email.toLowerCase(), 1, {
      name: `${user.firstName} ${user.middleName ? user.middleName + ' ' : ''}${user.lastName}`.trim(),
      token: user.verificationToken,
      studentId: user.studentID
    });

    if (!emailSent) {
      return res.status(500).json({
        success: false,
        error: 'Failed to send verification email'
      });
    }

    res.json({
      success: true,
      message: 'Verification email sent successfully'
    });
  } catch (error) {
    console.error('Resend verification error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to resend verification email'
    });
  }
});

// Resend OTP
router.post('/resend-otp', async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Generate new OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.otp = otp;
    user.otpExpires = Date.now() + 15 * 60 * 1000; // 15 minutes
    await user.save();

    const emailSent = await sendEmail(email.toLowerCase(), 2, {
      name: user.firstName,
      otp: otp,
      ipAddress: req.ip || 'Unknown'
    });

    if (!emailSent) {
      return res.status(500).json({
        success: false,
        error: 'Failed to resend OTP'
      });
    }

    res.json({
      success: true,
      message: 'New OTP sent successfully'
    });
  } catch (error) {
    console.error('Resend OTP error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to resend OTP'
    });
  }
});

// Get Current User
router.get('/me', async (req, res) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const authToken = authHeader.split(' ')[1]; // Changed from 'token' to 'authToken'

  let decoded;
  try {
    decoded = jwt.verify(authToken, process.env.JWT_SECRET);
  } catch (err) {
    console.error('JWT Verification Error:', err.message);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  try {
    const user = await User.findById(decoded.userId).select('-password');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({
      success: true,
      user: user
    });
  } catch (err) {
    console.error('Error in /me:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get user by email
router.get('/user/:email', async (req, res) => {
  try {
    const email = req.params.email;
    const user = await User.findOne({ email }).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // If profileImage is Cloudinary URL, just use it as is
    let profileImageUrl = user.profileImage || null;

    res.json({
      success: true,
      data: {
        ...user.toObject(),
        profileImage: profileImageUrl
      }
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
});




router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    // Validate input
    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Please enter a valid email address'
      });
    }

    // Find user by email
    const user = await User.findOne({ email: email.toLowerCase().trim() });

    // Always return success message for security (don't reveal if email exists)
    const successResponse = {
      success: true,
      message: 'If an account with that email exists, password reset instructions have been sent to your email address.'
    };

    if (!user) {
      console.log(`Password reset requested for non-existent email: ${email}`);
      return res.json(successResponse);
    }

    // Check if user is verified
    if (!user.isVerified) {
      console.log(`Password reset requested for unverified email: ${email}`);
      return res.json(successResponse);
    }

    // Generate reset token with 1 hour expiration
    const resetToken = crypto.randomBytes(20).toString('hex');
    user.resetToken = resetToken;
    user.resetTokenExpires = Date.now() + 60 * 60 * 1000; // 1 hour expiration
    user.resetTokenUsed = false;
    await user.save();

    console.log(`Password reset token generated for: ${email}`);

    // Create deep link URL for mobile app
    const deepLinkUrl = `mantraklatan://reset-password?token=${resetToken}&email=${encodeURIComponent(email)}`;

    // Prepare reset URL for email
    const resetUrl = `${API_BASE_URL}/api/auth/reset-password?token=${resetToken}&email=${encodeURIComponent(email)}`;

    // Send password reset email
    const fullName = `${user.firstName} ${user.middleName ? user.middleName + ' ' : ''}${user.lastName}`.trim();
    const emailSent = await sendEmail(email.toLowerCase(), 3, {
      name: fullName,
      resetUrl: resetUrl,
      deepLinkUrl: deepLinkUrl,
      token: resetToken,
      expirationTime: 60, // 60 minutes (1 hour)
      ipAddress: req.ip || 'Unknown'
    });

    if (!emailSent) {
      console.error(`Failed to send password reset email to: ${email}`);
      // Clear the reset token since email failed
      user.resetToken = undefined;
      user.resetTokenExpires = undefined;
      await user.save();

      return res.status(500).json({
        success: false,
        error: 'Failed to send reset instructions. Please try again later.'
      });
    }

    console.log(`Password reset email sent successfully to: ${email}`);
    res.json(successResponse);

  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error. Please try again later.'
    });
  }
});

// Update the /reset-password GET route to handle app deep linking better
router.get('/reset-password', async (req, res) => {
  try {
    const { token, email } = req.query;
    const userAgent = req.headers['user-agent'] || '';
    const isMobileApp = userAgent.includes('MANTRAklatan'); // Adjust based on your app's user-agent

    // Find user with valid token
    const user = await User.findOne({
      email: email.toLowerCase(),
      resetToken: token,
      resetTokenExpires: { $gt: Date.now() },
      resetTokenUsed: { $ne: true }
    });



    // Base HTML template to avoid repetition
    const baseHtml = (content, metaTitle = 'Password Reset - MANTRAklatan') => `
        <!DOCTYPE html>
        <html>
        <head>
          <title>${metaTitle}</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
              background-color: #f5f5f7;
              margin: 0;
              padding: 20px;
              color: #333;
            }
            .container {
              max-width: 500px;
              margin: 40px auto;
              padding: 30px;
              background: white;
              border-radius: 12px;
              box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
              text-align: center;
            }
            .logo {
              font-size: 48px;
              margin-bottom: 20px;
            }
            h1 {
              font-size: 24px;
              margin: 0 0 15px;
            }
            p {
              font-size: 16px;
              line-height: 1.5;
              margin: 0 0 20px;
            }
            .error {
              color: #d32f2f;
            }
            .success {
              color: #388e3c;
            }
            .button {
              display: inline-block;
              padding: 12px 24px;
              background-color: #007AFF;
              color: white;
              text-decoration: none;
              border-radius: 25px;
              font-weight: 500;
              transition: background-color 0.2s;
              margin: 10px;
            }
            .button:hover {
              background-color: #0062CC;
            }
            .secondary-button {
              background-color: transparent;
              color: #007AFF;
              border: 2px solid #007AFF;
            }
            .secondary-button:hover {
              background-color: #007AFF;
              color: white;
            }
            .hidden {
              display: none;
            }
            .countdown {
              font-size: 14px;
              color: #666;
              margin-top: 15px;
            }
          </style>
        </head>
        <body>
          ${content}
        </body>
        </html>
      `;

    if (!token || !email) {
      const appLink = 'mantraklatan://reset-password?error=missing_parameters';
      return res.status(400).send(baseHtml(`
          <div class="container">
            <div class="logo">⚠️</div>
            <h1>Invalid Reset Link</h1>
            <p class="error">This password reset link is missing required parameters.</p>
            <p>Please request a new password reset from the app.</p>
            <div style="margin-top: 30px;">
              <a href="${appLink}" class="button">Open MANTRAklatan App</a>
              <br>
              <small style="color: #666; display: block; margin-top: 15px;">
                If the app doesn't open automatically, make sure you have MANTRAklatan installed on your device.
              </small>
            </div>
          </div>
          <script>
            // Try to open app immediately
            setTimeout(() => {
              window.location.href = '${appLink}';
            }, 500);
          </script>
        `, 'Invalid Reset Link'));
    }

    if (!user) {
      if (isMobileApp) {
        return res.status(400).json({
          success: false,
          error: 'Invalid or expired reset token'
        });
      }
      const appLink = 'mantraklatan://reset-password?error=invalid_token';
      return res.status(400).send(baseHtml(`
          <div class="container">
            <div class="logo">⏰</div>
            <h1>Reset Link Expired</h1>
            <p class="error">This password reset link has expired or has already been used.</p>
            <p>Password reset links are valid for 15 minutes for security reasons.</p>
            <div style="margin-top: 30px;">
              <a href="${appLink}" class="button">Open MANTRAklatan App</a>
              <br>
              <small style="color: #666; display: block; margin-top: 15px;">
                You can request a new password reset link from the app.
              </small>
            </div>
          </div>
          <script>
            // Try to open app immediately
            setTimeout(() => {
              window.location.href = '${appLink}';
            }, 500);
          </script>
        `, 'Reset Link Expired'));
    }


    if (isMobileApp) {
      return res.json({
        success: true,
        message: 'Reset token is valid',
        token,
        email: user.email,
        user: {
          firstName: user.firstName,
          lastName: user.lastName
        }
      });
    }
    // Valid token - redirect to app with token and email
    const appLink = `mantraklatan://reset-password?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;

    res.send(baseHtml(`
        <div class="container">
          <div class="logo">🔐</div>
          <h1>Password Reset</h1>
          <p class="success">Your password reset link is valid!</p>
          <p>Opening MANTRAklatan app to reset your password...</p>
          <div class="countdown" id="countdown">Redirecting in 3 seconds...</div>
          <div style="margin-top: 30px;">
            <a href="${appLink}" class="button" id="manual-open">Open MANTRAklatan App</a>
            <br>
            <small style="color: #666; display: block; margin-top: 15px;">
              If the app doesn't open automatically, tap the button above or make sure you have MANTRAklatan installed.
            </small>
          </div>
        </div>
        <script>
          let countdown = 3;
          const countdownEl = document.getElementById('countdown');
          const manualBtn = document.getElementById('manual-open');
          
          const timer = setInterval(() => {
            countdown--;
            if (countdown > 0) {
              countdownEl.textContent = \`Redirecting in \${countdown} seconds...\`;
            } else {
              countdownEl.textContent = 'Opening app...';
              clearInterval(timer);
              // Try to open app
              window.location.href = '${appLink}';
              
              // Show manual button more prominently after attempt
              setTimeout(() => {
                countdownEl.textContent = 'Tap the button above if the app didn\\'t open automatically.';
                manualBtn.style.backgroundColor = '#FF3B30';
                manualBtn.style.transform = 'scale(1.05)';
                manualBtn.textContent = 'Open App Manually';
              }, 2000);
            }
          }, 1000);
          
          // Also try immediate redirect for better UX
          setTimeout(() => {
            window.location.href = '${appLink}';
          }, 100);
        </script>
      `, 'Reset Password - MANTRAklatan'));

  } catch (error) {
    console.error('Password reset page error:', error);
    const appLink = 'mantraklatan://reset-password?error=server_error';
    res.status(500).send(baseHtml(`
        <div class="container">
          <div class="logo">⚠️</div>
          <h1>Server Error</h1>
          <p class="error">An error occurred while processing your password reset.</p>
          <p>Please try again or contact support if the problem persists.</p>
          <div style="margin-top: 30px;">
            <a href="${appLink}" class="button">Open MANTRAklatan App</a>
          </div>
        </div>
        <script>
          setTimeout(() => {
            window.location.href = '${appLink}';
          }, 500);
        </script>
      `, 'Reset Error - MANTRAklatan'));
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    const { token, email, newPassword, confirmPassword } = req.body;

    // Validate input
    if (!token || !email || !newPassword || !confirmPassword) {
      return res.status(400).json({
        success: false,
        error: 'All fields are required'
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        error: 'Passwords do not match'
      });
    }

    // Enhanced password validation
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!passwordRegex.test(newPassword)) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one special character'
      });
    }

    const user = await User.findOne({
      email: email.toLowerCase(),
      resetToken: token,
      resetTokenExpires: { $gt: Date.now() },
      resetTokenUsed: { $ne: true }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired reset token'
      });
    }

    // Update password (pre-save hook will hash it)
    user.password = newPassword;
    user.resetToken = undefined;
    user.resetTokenExpires = undefined;
    user.resetTokenUsed = true;
    console.log("Raw new password from request:", newPassword);
    await user.save();

    res.json({
      success: true,
      message: 'Password has been reset successfully'
    });

  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reset password'
    });
  }
});


router.post('/verify-reset-token', async (req, res) => {
  try {
    let { token, email, checkStatus } = req.body;
    email = email ? email.toLowerCase().trim() : null;

    if (checkStatus) {
      // Check for any active reset token
      const user = await User.findOne({
        email,
        resetToken: { $exists: true },
        resetTokenExpires: { $gt: Date.now() },
        resetTokenUsed: { $ne: true }
      }).select('resetToken resetTokenExpires firstName lastName email');

      if (!user) {
        return res.json({
          success: true,
          hasActiveReset: false
        });
      }

      return res.json({
        success: true,
        hasActiveReset: true,
        token: user.resetToken,  // Make sure to send the token back
        expiresAt: user.resetTokenExpires,
        user: {
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email
        }
      });
    }

    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'Token is required',
        code: 'TOKEN_REQUIRED'
      });
    }

    // Full token verification
    const user = await User.findOne({
      email,
      resetToken: token,
      resetTokenExpires: { $gt: Date.now() },
      resetTokenUsed: { $ne: true }
    }).select('firstName lastName email resetTokenExpires');

    if (!user) {
      // Detailed error diagnostics
      const potentialUser = await User.findOne({ email });
      let errorReason = 'Invalid token';
      let code = 'INVALID_TOKEN';

      if (!potentialUser) {
        errorReason = 'No account with this email exists';
        code = 'USER_NOT_FOUND';
      } else {
        const tokenRecord = await User.findOne({ email, resetToken: token });

        if (tokenRecord) {
          if (tokenRecord.resetTokenUsed) {
            errorReason = 'Token already used';
            code = 'TOKEN_USED';
          } else if (tokenRecord.resetTokenExpires <= Date.now()) {
            errorReason = 'Token expired';
            code = 'TOKEN_EXPIRED';
          }
        }
      }

      return res.status(400).json({
        success: false,
        error: errorReason,
        code,
        details: process.env.NODE_ENV === 'development' ? {
          emailExists: !!potentialUser,
          tokenExists: !!tokenRecord,
          tokenExpired: tokenRecord?.resetTokenExpires <= Date.now(),
          tokenUsed: tokenRecord?.resetTokenUsed
        } : undefined
      });
    }

    // Successful verification
    res.json({
      success: true,
      message: 'Token is valid',
      user: {
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email
      },
      expiresAt: user.resetTokenExpires
    });

  } catch (error) {
    console.error('Token verification error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error during token verification',
      code: 'SERVER_ERROR'
    });
  }
});

// Update user profile
router.put('/update/:email', async (req, res) => {
  try {
    const email = req.params.email.toLowerCase();
    const { course, yearLevel, department, studentID } = req.body;

    const user = await User.findOneAndUpdate(
      { email },
      { course, yearLevel, department, studentID },
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({ success: true, data: user });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});




export default router;