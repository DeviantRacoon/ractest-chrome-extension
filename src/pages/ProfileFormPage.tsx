import React from "react";
import { ProfileFormView } from "../modules/profiles";
import { useProfileForm } from "../modules/profiles/hooks/useProfileForm";

const ProfileFormPage: React.FC = () => {
  const logic = useProfileForm();
  return <ProfileFormView {...logic} />;
};

export default ProfileFormPage;
