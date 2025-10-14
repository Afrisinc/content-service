import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { env } from '../config/env';

export const generateToken = (userId: string) =>
  jwt.sign({ userId }, env.JWT_SECRET, { expiresIn: '7d' });

export const hashPassword = async (password: string) =>
  bcrypt.hash(password, 10);
export const comparePassword = async (password: string, hash: string) =>
  bcrypt.compare(password, hash);
