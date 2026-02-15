export type TimeOfDay = "day" | "night";

export type PracticeSession = {
  id: string;
  studentId: string;
  date: string;
  startTime: string;
  durationMinutes: number;
  timeOfDay: TimeOfDay;
  weather: string;
  notes?: string;
  createdAt: string;
};

export type PracticeSummary = {
  studentId: string;
  sessionCount: number;
  totalHours: number;
  dayHours: number;
  nightHours: number;
};
