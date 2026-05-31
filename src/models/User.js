import mongoose from "mongoose";
import bcrypt from "bcrypt";
import { maxLength, string } from "zod/v4";

const userSchema = new mongoose.Schema(
  {
    fullname: { type: String, required: true, trim: true },
    username: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      lowercase: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: { type: String, required: true, minlength: 8 },
    isEmailVerified: { type: Boolean, default: false },
    verificationCode: { type: String, select: false },
    verificationCodeExpires: { type: Date, select: false },
    refreshToken: { type: String, select: false },
    role: { type: String, enum: ["user", "admin"], default: "user" },
    bio: { type: string, maxlength: 300, default: "" },
    theme: {
      type: string,
      enum: ["light", "dark", "auto"],
      default: "light",
    },
    timeZone: { type: String, default: "UTC+0" },
    interests: [
      {
        type: String,
      },
    ],
    goals: [
      {
        type: String,
      },
    ],
    onboardingCompleted: { type: Boolean, default: false },
    streak: { type: Number, default: 1 },
    savedRecommendations: [{ type: String }],
  },
  { timestamps: true },
);

// Hashing Middleware (Fixed: No 'next' for async)
userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
  } catch (error) {
    throw error;
  }
});

// Methods
userSchema.methods.generateVerificationCode = function () {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  this.verificationCode = code;
  this.verificationCodeExpires = Date.now() + 15 * 60 * 1000;
  return code;
};

userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

export default mongoose.model("User", userSchema);
