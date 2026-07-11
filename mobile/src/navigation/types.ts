export type AuthStackParamList = {
  Login: undefined;
  Otp: { phone: string; devCode?: string };
};

export type FarmerTabParamList = {
  Dashboard: undefined;
  Projects: undefined;
  Payments: undefined;
  Profile: undefined;
};

export type AdminTabParamList = {
  Dashboard: undefined;
  Farmers: undefined;
  Import: undefined;
  Register: undefined;
  Users: undefined;
  Profile: undefined;
};

export type RegistrationStackParamList = {
  Country: undefined;
  BasicInfo: undefined;
  Location: undefined;
  Membership: undefined;
  Details: undefined;
  Projects: undefined;
  Photo: undefined;
  Confirm: undefined;
};

export type ImportStackParamList = {
  CsvUpload: undefined;
  CsvValidation: { fileName: string; fileContent: string };
  CsvImport: { sessionId: string; willImport: number };
};

// Legacy - kept for compatibility
export type RootStackParamList = {
  Home: undefined;
  Registration: undefined;
  Admin: undefined;
};

export type AdminStackParamList = ImportStackParamList;
