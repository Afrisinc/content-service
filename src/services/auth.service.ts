import { UserRepository } from '../repositories/user.repository';
import { hashPassword, comparePassword, generateToken } from '../utils/jwt';

const repo = new UserRepository();

export class AuthService {
  async register(data: any) {
    const existing = await repo.findByEmail(data.email);
    if (existing) {
      throw new Error('Email already exists');
    }

    const hashed = await hashPassword(data.password);
    const user = await repo.create({ ...data, password: hashed });
    const token = generateToken(user.id);

    return { user, token };
  }

  async login(data: any) {
    const user = await repo.findByEmail(data.email);
    if (!user) {
      throw new Error('Invalid credentials');
    }

    const valid = await comparePassword(data.password, user.password);
    if (!valid) {
      throw new Error('Invalid credentials');
    }

    const token = generateToken(user.id);
    return { user, token };
  }

  async getProfile(userId: string) {
    const user = await repo.findByIdWithAccounts(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Exclude password from response
    const { password, socialAccounts, ...profile } = user;

    // Format social accounts to exclude sensitive tokens
    const formattedAccounts = socialAccounts.map((account: any) => ({
      id: account.id,
      platform: account.platform,
      pageId: account.pageId,
      pageName: account.pageeName,
      isActive: account.isActive,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
    }));

    return {
      ...profile,
      socialAccounts: formattedAccounts,
    };
  }
}
