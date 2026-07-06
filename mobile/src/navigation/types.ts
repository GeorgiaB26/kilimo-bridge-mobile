export type RootStackParamList = {
  Home: undefined;
  Registration: undefined;
  Admin: undefined;
};

export type RegistrationStackParamList = {
  BasicInfo: undefined;
  Location: undefined;
  Membership: undefined;
  Details: undefined;
  Projects: undefined;
  Photo: undefined;
  Confirm: undefined;
};

export type AdminStackParamList = {
  CsvUpload: undefined;
  CsvValidation: { fileName: string; fileContent: string };
  CsvImport: { sessionId: string; willImport: number };
};
