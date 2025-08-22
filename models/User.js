import { Schema, model } from 'mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const userSchema = new Schema({
  firstName: { type: String, required: true },
  middleName: { type: String },
  lastName: { type: String, required: true },
  studentID: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone: { type: String, required: true },
  dob: { type: Date, required: true },
  password: { type: String, required: true },
  course: { type: String, required: true },
  yearLevel: { type: String, required: true },
  department: { type: String, required: true },
  profileImage: { type: String },
  lastLogin: { type: Date },
  loginCount: { type: Number, default: 0 },
  loginAttempts: { type: Number, default: 0 },
  isVerified: { type: Boolean, default: false },
  verificationToken: { type: String },
  verificationTokenExpires: { type: Date },
  otp: { type: String },
  otpExpires: { type: Date },
  role: { type: String, default: 'patron' },

  // Password reset fields
  resetToken: { type: String },
  resetTokenExpires: { type: Date },
  resetTokenUsed: { type: Boolean, default: false }
}, {
  timestamps: true,
  collection: 'lms_user',
  toJSON: {
    transform: function (doc, ret) {
      delete ret.password;
      delete ret.__v;
      delete ret.otp;
      delete ret.verificationToken;
      delete ret.loginAttempts;
      delete ret.resetToken;
      delete ret.resetTokenExpires;
      delete ret.resetTokenUsed;
      return ret;
    },
  },
});

// Password hashing middleware
userSchema.pre('save', async function (next) {
  if (this.isModified('password')) {
    try {
      const salt = await bcrypt.genSalt(10);
      this.password = await bcrypt.hash(this.password, salt);

      // Clear reset token if password was changed
      if (this.resetToken) {
        this.resetToken = undefined;
        this.resetTokenExpires = undefined;
        this.resetTokenUsed = true;
      }
    } catch (err) {
      return next(err);
    }
  }
  next();
});

// Password comparison method
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Password reset token generation
userSchema.methods.generatePasswordResetToken = function () {
  const resetToken = crypto.randomBytes(32).toString('hex');
  this.resetToken = resetToken;
  this.resetTokenExpires = Date.now() + 3600000; // 1 hour
  this.resetTokenUsed = false;
  return resetToken;
};

// Clear reset token
userSchema.methods.clearPasswordResetToken = function () {
  this.resetToken = undefined;
  this.resetTokenExpires = undefined;
  this.resetTokenUsed = true;
};

// Check if reset token is valid
userSchema.methods.isResetTokenValid = function (token) {
  return (
    this.resetToken === token &&
    this.resetTokenExpires > Date.now() &&
    !this.resetTokenUsed
  );
};

export default model('User', userSchema, 'lms_user');