/** Client-side form validation for sign-in and sign-up. */
import { z } from "zod";

export const signInSchema = z.object({
  email: z.string().trim().min(1, "Enter your email."),
  password: z.string().min(1, "Enter your password."),
});

export const signUpSchema = z.object({
  name: z.string().trim().min(2, "Enter your name."),
  email: z.email("Enter a valid email address."),
  phone: z.string().trim().max(20).nullable().optional(),
  password: z.string().min(8, "Passwords need at least 8 characters."),
});
