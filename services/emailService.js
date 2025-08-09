import axios from "axios";
import { getEnvironmentConfig } from "../config/environment.js";

const { apiUrl: API_BASE_URL } = getEnvironmentConfig();

const sendEmail = async (to, templateId, params) => {
  const BREVO_API_KEY = process.env.BREVO_API_KEY;

  if (!BREVO_API_KEY) {
    console.error('BREVO_API_KEY is missing from environment variables');
    return false;
  }

  // Validate required parameters
  if (!to || !templateId) {
    console.error('Missing required parameters: to or templateId');
    return false;
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(to)) {
    console.error('Invalid email format:', to);
    return false;
  }

  // Base payload structure
  const payload = {
    sender: {
      name: "MANTRAklatan",
      email: "aimsmantraklatan@gmail.com"
    },
    to: [{ email: to }],
    templateId: parseInt(templateId),
    params: {}
  };

  try {
    // Configure template-specific parameters
    switch (templateId) {
      case 1: // Registration/Email Verification template
        if (!params?.token || !params?.name) {
          throw new Error('Missing required parameters for registration template: token, name');
        }

        const webVerificationUrl = `${API_BASE_URL}/api/auth/verify-email?token=${params.token}&email=${encodeURIComponent(to)}`;

        payload.params = {
          name: params.name,
          verificationLink: webVerificationUrl,
          studentId: params.studentId || '',
          currentYear: new Date().getFullYear().toString()
        };
        break;

      case 2: // Login OTP template
        if (!params?.otp || !params?.name) {
          throw new Error('Missing required parameters for OTP template: otp, name');
        }

        payload.params = {
          name: params.name,
          otp: params.otp.toString(),
          ipAddress: params.ipAddress || 'Unknown',
          currentYear: new Date().getFullYear().toString()
        };
        break;

      case 3: // Password reset template
        if (!params?.name || !params?.token) {
          throw new Error('Missing required parameters for password reset template: name, token');
        }

        const resetUrl = `${API_BASE_URL}/api/auth/reset-password?token=${params.token}&email=${encodeURIComponent(to)}`;

        payload.params = {
          name: params.name,
          resetUrl: resetUrl,
          token: params.token, // Include token in params
          expirationTime: params.expirationTime || 15, // minutes
          ipAddress: params.ipAddress || 'Unknown',
          currentYear: new Date().getFullYear().toString()
        };
        break;

      default:
        throw new Error(`Unsupported template ID: ${templateId}`);
    }

    console.log('Preparing to send email:', {
      to,
      templateId,
      hasRequiredParams: Object.keys(payload.params).length > 0,
      apiBaseUrl: API_BASE_URL
    });

    // Send email via Brevo API
    const response = await axios.post(
      'https://api.brevo.com/v3/smtp/email',
      payload,
      {
        headers: {
          'api-key': BREVO_API_KEY,
          'content-type': 'application/json',
          'accept': 'application/json'
        },
        timeout: 15000, // 15 second timeout
        validateStatus: (status) => status < 500 // Don't throw on 4xx errors
      }
    );

    // Check if the request was successful
    if (response.status >= 200 && response.status < 300) {
      console.log('Email sent successfully:', {
        messageId: response.data?.messageId,
        to: to,
        templateId: templateId,
        status: response.status
      });
      return true;
    } else {
      console.error('Email API returned non-success status:', {
        status: response.status,
        statusText: response.statusText,
        data: response.data,
        to: to,
        templateId: templateId
      });
      return false;
    }

  } catch (error) {
    // Handle different types of errors
    if (error.response) {
      // Server responded with error status
      console.error('Email API error response:', {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data,
        to: to,
        templateId: templateId
      });

      // Log specific Brevo API errors
      if (error.response.data?.message) {
        console.error('Brevo API message:', error.response.data.message);
      }

    } else if (error.request) {
      // Request was made but no response received
      console.error('Email API timeout/network error:', {
        message: error.message,
        to: to,
        templateId: templateId,
        timeout: error.code === 'ECONNABORTED'
      });

    } else {
      // Something else went wrong
      console.error('Email service error:', {
        message: error.message,
        to: to,
        templateId: templateId,
        stack: error.stack
      });
    }

    return false;
  }
};

// Helper function to validate email parameters before sending
export const validateEmailParams = (templateId, params) => {
  const requiredParams = {
    1: ['name', 'token'], // Registration
    2: ['name', 'otp'],   // OTP
    3: ['name']           // Password reset (token can be in resetUrl)
  };

  const required = requiredParams[templateId];
  if (!required) {
    return { valid: false, error: `Unknown template ID: ${templateId}` };
  }

  const missing = required.filter(param => !params[param]);
  if (missing.length > 0) {
    return {
      valid: false,
      error: `Missing required parameters for template ${templateId}: ${missing.join(', ')}`
    };
  }

  return { valid: true };
};

// Helper function to get template info
export const getTemplateInfo = (templateId) => {
  const templates = {
    1: { name: 'Email Verification', description: 'Account registration verification' },
    2: { name: 'Login OTP', description: 'One-time password for login' },
    3: { name: 'Password Reset', description: 'Password reset instructions' }
  };

  return templates[templateId] || { name: 'Unknown', description: 'Unknown template' };
};

export default sendEmail;