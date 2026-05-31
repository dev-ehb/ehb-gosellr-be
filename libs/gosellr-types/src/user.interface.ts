export type UserRole = 'seller' | 'buyer';

export interface IUser {
  _id: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  pss_user_id?: string;
  created_at: Date;
  updated_at: Date;
}

export interface IUserPublic {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
}
