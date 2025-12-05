/**
 * Player profile data structure matching Playroomkit's getProfile() return type
 */
export type PlayerProfile = {
  name: string;
  color: {
    r: number;
    g: number;
    b: number;
    hexString: string;
    hex: number;
  };
  photo: string;
  avatarIndex: number;
};
