import { create } from 'zustand';
import type { RegistrationFormData } from '../types';

interface RegistrationState {
  currentStep: number;
  formData: RegistrationFormData;
  setStep: (step: number) => void;
  updateForm: (data: Partial<RegistrationFormData>) => void;
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
  membershipGroup: '',
  aggregationCenter: '',
  membershipType: 'Active',
  occupation: '',
  sizeOfLand: '',
  project1: '',
  project2: '',
  project3: '',
  pictureUri: undefined,
};

export const useRegistrationStore = create<RegistrationState>((set) => ({
  currentStep: 0,
  formData: { ...initialFormData },
  setStep: (step) => set({ currentStep: step }),
  updateForm: (data) =>
    set((state) => ({ formData: { ...state.formData, ...data } })),
  resetForm: () => set({ currentStep: 0, formData: { ...initialFormData } }),
}));
