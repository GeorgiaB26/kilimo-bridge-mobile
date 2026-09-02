import React from 'react';
import { FarmerProfilePhoto } from './FarmerProfilePhoto';
import { isUsableFarmerPhotoUrl } from '../../shared/src/farmerPhoto';

interface ProfileAvatarProps {
  name: string;
  pictureUrl?: string | null;
  size?: 'large' | 'hero';
  label?: string;
}

/** Real farmer verification photo only — no initials avatars. */
export function ProfileAvatar({
  name,
  pictureUrl,
  size = 'large',
  label,
}: ProfileAvatarProps) {
  return (
    <FarmerProfilePhoto
      name={name}
      pictureUrl={pictureUrl}
      size={size}
      label={label}
    />
  );
}

export function hasProfilePhoto(pictureUrl?: string | null): boolean {
  return isUsableFarmerPhotoUrl(pictureUrl);
}
