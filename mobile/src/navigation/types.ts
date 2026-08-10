import type { NavigatorScreenParams } from '@react-navigation/native';
import type { FarmerProject } from '../types/farmerProject';

export type AuthStackParamList = {
  Login: undefined;
  Otp: { phone: string; devCode?: string };
  Register: undefined;
};

export type FarmerProjectsStackParamList = {
  ProjectsList: undefined;
  ProjectDetail: { project: FarmerProject; programProjectId?: string };
  HierarchyProjectDetail: { projectId: string; projectName: string };
};

export type FarmerTabParamList = {
  Dashboard: undefined;
  Projects: NavigatorScreenParams<FarmerProjectsStackParamList>;
  Tasks: {
    statusFilter?: 'overdue' | 'in_progress' | 'not_started' | 'completed';
    highlightTaskId?: string;
    taskId?: string;
  } | undefined;
  Payments: { highlightPaymentId?: string } | undefined;
  Profile: undefined;
};

export type FarmerRootStackParamList = {
  MainTabs: NavigatorScreenParams<FarmerTabParamList> | undefined;
  MessagesFlow: NavigatorScreenParams<MessagesStackParamList> | undefined;
  NotificationsFlow: NavigatorScreenParams<NotificationsStackParamList> | undefined;
};

export type AdminTabParamList = {
  Dashboard: undefined;
  Farmers: undefined;
  Manage: undefined;
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

export type AgentFarmersStackParamList = {
  FarmerList: { statusFilter?: string } | undefined;
  RegisterPicker: undefined;
  RegisterFarmerFlow: undefined;
  RegisterFieldAgent: undefined;
  FarmerProfile: { farmerId: string; name: string };
};

export type AgentTabParamList = {
  Dashboard: undefined;
  Farmers: NavigatorScreenParams<AgentFarmersStackParamList> | undefined;
  Tasks: {
    filter?: 'all' | 'overdue' | 'not_started' | 'in_progress' | 'completed';
    openAdd?: boolean;
    taskId?: string;
    highlightTaskId?: string;
  } | undefined;
  Audit: undefined;
  Profile: undefined;
};

export type AgentRootStackParamList = {
  MainTabs: NavigatorScreenParams<AgentTabParamList> | undefined;
  MessagesFlow: NavigatorScreenParams<MessagesStackParamList> | undefined;
  NotificationsFlow: NavigatorScreenParams<NotificationsStackParamList> | undefined;
};

export type MessagesStackParamList = {
  MessagesList: undefined;
  MessageDetail: { threadId: string };
};

export type NotificationsStackParamList = {
  NotificationsList: undefined;
  NotificationSettings: undefined;
};

export type RegistrationStackParamList = {
  UserTypeSelection: undefined;
  FieldAgentRegistration: undefined;
  StaffRegistration: { variant: 'admin' | 'project_manager' };
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
