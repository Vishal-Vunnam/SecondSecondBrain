export type ServiceKey = "syncthing" | "terminal" | "couchdb" | "ollama";

export type ServiceStatus = "checking" | "online" | "offline";

export type Service = {
  key: ServiceKey;
  label: string;
  detail: string;
  endpoint: string;
};

export type AppModuleId =
  | "home"
  | "tasks"
  | "notes"
  | "terminal"
  | "system"
  | "health"
  | "health-log"
  | "health-food"
  | "fitness"
  | "health-body"
  | "money"
  | "shopping"
  | "budget"
  | "expenses";

export type AppModuleStatus = "active" | "planned";

export type AppModuleGroup = "home" | "knowledge" | "health" | "money";

export type ShoppingNecessity = "essential" | "important" | "nice";

export type WorkoutStatus = "planned" | "done" | "skipped";

export type WorkoutSet = {
  id?: number;
  exercise: string;
  weight: number | null;
  reps: number | null;
  position: number;
};

export type Workout = {
  id: number;
  date: string;
  name: string;
  description: string | null;
  status: WorkoutStatus;
  planned: boolean;
  recurrenceId: number | null;
  createdAt: string;
  updatedAt: string;
  sets: WorkoutSet[];
};

export type WorkoutRecurrence = {
  id: number;
  name: string;
  description: string | null;
  daysOfWeek: number[];
  templateSets: { exercise: string; weight: number | null; reps: number | null }[];
  startDate: string;
  endDate: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ExerciseSummary = { name: string; uses: number };

export type FitnessStats = {
  thisWeek: {
    weekStart: string;
    workoutsDone: number;
    workoutsPlanned: number;
    volume: number;
    volumePrevWeek: number;
  };
  volumeByWeek: { weekStart: string; volume: number }[];
};

export type ShoppingItem = {
  id: number;
  title: string;
  reasoning: string | null;
  type: string | null;
  necessity: ShoppingNecessity;
  gotIt: boolean;
  link: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AppModule = {
  id: AppModuleId;
  title: string;
  shortTitle: string;
  description: string;
  group: AppModuleGroup;
  status: AppModuleStatus;
};

export type AppTheme = "light" | "dark" | "guston-light" | "guston-dark";

export type Shelf = {
  name: string;
  detail: string;
  count: string;
};

export type VaultEntry = {
  name: string;
  path: string;
  type: "directory" | "file";
  size: number;
  modifiedAt: string;
  children?: VaultEntry[];
};

export type VaultDirectory = {
  path: string;
  parentPath: string | null;
  entries: VaultEntry[];
};

export type VaultFile = {
  path: string;
  name: string;
  content: string;
  modifiedAt: string;
  size: number;
};

export type WeatherSummary = {
  location: string;
  condition: string;
  temperatureF: number | null;
  feelsLikeF: number | null;
  windMph: number | null;
  observedAt: string | null;
};

export type NewsItem = {
  title: string;
  source: string;
  url: string;
  publishedAt: string | null;
};

export type NewsSummary = {
  source: string;
  generatedAt: string;
  items: NewsItem[];
};

export type FeedSourceType = "rss" | "hn" | "reddit";

export type FeedSource = {
  id: number;
  name: string;
  type: FeedSourceType;
  url: string;
  weight: number;
  enabled: boolean;
  createdAt: string;
};

export type FeedProfile = {
  id: number;
  name: string;
  description: string;
  keywordInclude: string[];
  keywordExclude: string[];
  sourceWeights: Record<string, number>;
  enabled: boolean;
};

export type FeedInteractionAction = "opened" | "saved" | "dismissed" | "hidden";

export type FeedItem = {
  id: string;
  sourceId: number;
  sourceName: string;
  sourceType: FeedSourceType;
  title: string;
  url: string;
  summary: string | null;
  publishedAt: string | null;
  fetchedAt: string;
  score: number;
  interaction: FeedInteractionAction | null;
};

export type FeedResponse = {
  profile: FeedProfile;
  items: FeedItem[];
  generatedAt: string;
  lastPolledAt: string | null;
};

export type TaskStatus = "todo" | "doing" | "done";

export type TaskPriority = "low" | "medium" | "high";

export type TaskItem = {
  path: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  due: string | null;
  project: string | null;
  links: string[];
  created: string | null;
  modifiedAt: string;
  body: string;
};

export type TaskCreateInput = {
  title: string;
  context?: string;
  due?: string;
  priority?: TaskPriority;
  project?: string;
  links?: string[];
};

export type HealthEntryType = "meal" | "body" | "commitment";

type HealthLogBase = {
  id: number;
  type: HealthEntryType;
  capturedAt: string;
  loggedDate: string;
  source: string | null;
  summary: string | null;
  rawText: string | null;
  createdAt: string;
  updatedAt: string;
};

export type HealthMealEntry = HealthLogBase & {
  type: "meal";
  description: string;
  mealType: string | null;
  proteinGEstimate: number | null;
  caloriesEstimate: number | null;
  carbsGEstimate: number | null;
  fatGEstimate: number | null;
  fiberGEstimate: number | null;
  hunger: number | null;
  fullness: number | null;
  energy: number | null;
  digestion: number | null;
  gassiness: number | null;
  notes: string | null;
};

export type SocialLevel = "alone" | "light" | "heavy";
export type ActivityLevel = "sedentary" | "mixed" | "active";
export type SunLevel = "none" | "some" | "lots";

export type HealthBodyEntry = HealthLogBase & {
  type: "body";
  sleepHours: number | null;
  sleepQuality: number | null;
  energy: number | null;
  moodScore: number | null;
  soreness: number | null;
  stress: number | null;
  hydration: number | null;
  gassiness: number | null;
  focus: number | null;
  anxiety: number | null;
  clarity: number | null;
  motivation: number | null;
  social: SocialLevel | null;
  activityLevel: ActivityLevel | null;
  sunExposure: SunLevel | null;
  sick: boolean | null;
  alcohol: boolean | null;
  marijuana: boolean | null;
  mood: string | null;
  pain: string | null;
  symptoms: string | null;
  weightLb: number | null;
  notes: string | null;
};

export type HealthCommitmentEntry = {
  id: number;
  type: "commitment";
  title: string;
  description: string | null;
  cadence: string;
  targetCount: number | null;
  completedCount: number;
  reviewDate: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type HealthEntry = HealthMealEntry | HealthBodyEntry | HealthCommitmentEntry;

export type HealthOverview = {
  generatedAt: string;
  today: {
    date: string;
    meals: {
      count: number;
      proteinGEstimate: number | null;
      caloriesEstimate: number | null;
      lastDescription: string | null;
    };
    workouts: {
      count: number;
      durationMinutes: number | null;
      averageIntensity: number | null;
      lastDescription: string | null;
    };
    body: {
      count: number;
      sleepHours: number | null;
      sleepQuality: number | null;
      energy: number | null;
      moodScore: number | null;
      soreness: number | null;
      stress: number | null;
      hydration: number | null;
      gassiness: number | null;
      mood: string | null;
      pain: string | null;
      symptoms: string | null;
    };
    commitments: {
      activeCount: number;
      dueCount: number;
      next: HealthCommitmentEntry | null;
    };
  };
  insights: string[];
  commitments: HealthCommitmentEntry[];
  recent: HealthEntry[];
};

export type HealthCaptureResponse = {
  confirmation: string;
  route: HealthEntryType | "mixed";
  entries: HealthEntry[];
};
