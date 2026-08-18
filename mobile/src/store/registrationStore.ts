import { create } from 'zustand';
import type { RegistrationFormData } from '../types';

import type { RegistrationUserType } from '../constants/registrationUserTypes';

export interface StaffRegistrationFormData {
  name: string;
  phone: string;
  email: string;
  password: string;
  region: string;
  district: string;
}

interface RegistrationState {
  currentStep: number;
  userType: RegistrationUserType | null;
  formData: RegistrationFormData;
  staffFormData: StaffRegistrationFormData;
  setUserType: (userType: RegistrationUserType) => void;
  setStep: (step: number) => void;
  updateForm: (data: Partial<RegistrationFormData>) => void;
  updateStaffForm: (data: Partial<StaffRegistrationFormData>) => void;
  resetForm: () => void;
}

const initialFormData: RegistrationFormData = {
  name: '',
  gender: 'M',
  phone: '',
  idNumber: '',
  country: '',
  currency: '',
  district: '',
  subCounty: '',
  parish: '',
  village: '',
  ward: '',
  membershipGroup: '',
  aggregationCenter: '',
  aggregationCentreId: '',
  registrationCategory: 'individual',
  membershipType: 'Active',
  membershipCategory: '',
  membershipCategoryOther: '',
  corporateCategoryGroup: '',
  corporateCategorySub: '',
  corporateCategoryOther: '',
  profession: '',
  occupation: '',
  sizeOfLand: '',
  landUnit: 'Ha',
  farmInputRequired: '',
  familySize: '',
  numberOfDependants: '',
  specialNeeds: 'no',
  projectLocationGps: '',
  organizationName: '',
  organizationRegistrationNumber: '',
  taxPin: '',
  contactPersonName: '',
  contactPersonRole: '',
  contactPersonEmail: '',
  projectEnrolmentSectorId: '',
  projectEnrolmentProgramId: '',
  projectEnrolmentProjectId: '',
  skipProjectEnrolment: false,
  refugeeStatusDocumentUrl: '',
  refugeeStatusDocumentUri: undefined,
  refugeeStatusDocumentBase64: undefined,
  humanitarianAssistanceType: '',
  humanitarianAssistanceOther: '',
  preferredLanguage: 'English',
  preferredLanguageOther: '',
  emergencyContactName: '',
  emergencyContactPhone: '',
  specialVulnerabilities: [],
  specialVulnerabilitiesOther: '',
  pictureBase64: undefined,
  project1: '',
  project2: '',
  project3: '',
  pictureUri: undefined,
};

const initialStaffFormData: StaffRegistrationFormData = {
  name: '',
  phone: '',
  email: '',
  password: '',
  region: '',
  district: '',
};

export const useRegistrationStore = create<RegistrationState>((set) => ({
  currentStep: 0,
  userType: null,
  formData: { ...initialFormData },
  staffFormData: { ...initialStaffFormData },
  setUserType: (userType) => set({ userType }),
  setStep: (step) => set({ currentStep: step }),
  updateForm: (data) =>
    set((state) => ({ formData: { ...state.formData, ...data } })),
  updateStaffForm: (data) =>
    set((state) => ({ staffFormData: { ...state.staffFormData, ...data } })),
  resetForm: () =>
    set({
      currentStep: 0,
      userType: null,
      formData: { ...initialFormData },
      staffFormData: { ...initialStaffFormData },
    }),
}));
