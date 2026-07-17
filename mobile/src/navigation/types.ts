import type { NavigatorScreenParams } from '@react-navigation/native';
import type { FarmerProject } from '../types/farmerProject';

export type AuthStackParamList = {
  Login: undefined;
  Otp: { phone: string; devCode?: string };
};

export type FarmerProjectsStackParamList = {
  ProjectsList: undefined;
  ProjectDetail: { project: FarmerProject };
  HierarchyProjectDetail: { projectId: string; projectName: string };
  HierarchyTaskDetail: { farmerTaskId: string; taskName: string };
};

export type FarmerTabParamList = {
  Dashboard: undefined;
  Projects: NavigatorScreenParams<FarmerProjectsStackParamList>;
  Payments: undefined;
  Profile: undefined;
};

export type AdminTabParamList = {
  Dashboard: undefined;
  Farmers: undefined;
  Programs: undefined;
  Tasks: undefined;
  Centre: undefined;
  Import: undefined;
  Register: undefined;
  Users: undefined;
  Profile: undefined;
};

export type AdminProgramsStackParamList = {
  ProgramProjectsList: undefined;
  ProgramProjectDetail: { projectId: string; name: string };
  PendingTasks: undefined;
};

export type AdminFarmerSummary = {
  farmer_id: string;
  name: string;
  phone_number: string;
  country: string;
  district: string;
  sub_county?: string;
  aggregation_center: string | null;
  membership_group_name: string;
  status: string;
  kb_farmer_id?: string;
};

export type AdminFarmersStackParamList = {
  FarmersList: undefined;
  FarmerDetail: { farmerId: string; name: string };
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
