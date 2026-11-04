import type { TokenService } from "../../application/ports";
import type { ChangeUserPlan } from "../../application/use-cases/admin";
import type { GetMe, LoginUser, RegisterUser } from "../../application/use-cases/auth";
import type {
  DeleteCard,
  GetDashboard,
  GetQuiz,
  GetReviewQueue,
  GetTopic,
  ReviewCard,
  UpdateCard,
} from "../../application/use-cases/study";
import type { CreateTheme, GetActiveTheme, ListThemes, SetActiveTheme } from "../../application/use-cases/themes";
import type {
  CreateTopic,
  DeleteTopic,
  ExtractPdfText,
  GenerateMoreCards,
  GetGenerationJob,
} from "../../application/use-cases/topics";

/** Todo lo que la capa HTTP necesita. Se construye en el composition root (container.ts). */
export interface HttpDeps {
  tokens: TokenService;
  webOrigin: string;
  /** Saltos de proxy de confianza (Netlify + Render = 2). Ver la guía de despliegue. */
  trustProxy: number;
  secureCookies: boolean;
  useCases: {
    register: RegisterUser;
    login: LoginUser;
    getMe: GetMe;
    // Temas y generación
    extractPdf: ExtractPdfText;
    createTopic: CreateTopic;
    getTopic: GetTopic;
    deleteTopic: DeleteTopic;
    generateMore: GenerateMoreCards;
    getJob: GetGenerationJob;
    // Estudio
    dashboard: GetDashboard;
    reviewQueue: GetReviewQueue;
    reviewCard: ReviewCard;
    updateCard: UpdateCard;
    deleteCard: DeleteCard;
    quiz: GetQuiz;
    // Temas visuales (fuera del MVP, la API se conserva)
    createTheme: CreateTheme;
    listThemes: ListThemes;
    getActiveTheme: GetActiveTheme;
    setActiveTheme: SetActiveTheme;
    // Administración
    changeUserPlan: ChangeUserPlan;
  };
}
