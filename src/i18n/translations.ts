export type Lang = 'pt' | 'en' | 'fr'

export type Messages = {
  dateLocale: string
  weekdayShort: readonly [string, string, string, string, string, string, string]
  appTitle: string
  documentTitle: string
  calendarOpenTitle: string
  calendarPrevMonth: string
  calendarNextMonth: string
  pickerCalendarGroup: string
  screenBack: string
  screenChooseDay: string
  screenToday: string
  today: string
  signOut: string
  ariaYesterday: string
  ariaTomorrow: string
  ariaOpenCalendar: string
  loadingDay: string
  loadingSession: string
  taskDone: string
  taskTodo: string
  taskPlaceholder: string
  ariaTaskText: string
  ariaMarkTodo: string
  ariaMarkDone: string
  ariaAddField: string
  readOnlyPastDay: string
  monthlyPendingTitle: string
  monthlyPendingCount: string
  monthlyPendingEmpty: string
  moveToToday: string
  movedToToday: string
  moveAllToToday: string
  movedAllToToday: string
  confirmMoveAllToToday: string
  save: string
  saved: string
  setupTitle: string
  setupP1a: string
  setupP1b: string
  setupP1c: string
  setupP2: string
  setupP3: string
  authSubtitleLogin: string
  authSubtitleRegister: string
  authEmail: string
  authPassword: string
  authConfirmPassword: string
  authSubmitLogin: string
  authSubmitRegister: string
  authBusy: string
  authToggleToRegister: string
  authToggleToLogin: string
  authPasswordMismatch: string
  authPasswordMin: string
  authSignupSuccess: string
}

export const translations: Record<Lang, Messages> = {
  pt: {
    dateLocale: 'pt-PT',
    weekdayShort: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'],
    appTitle: 'ToDoDay',
    documentTitle: 'ToDoDay — Agenda',
    calendarOpenTitle: 'Abrir calendário',
    calendarPrevMonth: 'Mês anterior',
    calendarNextMonth: 'Mês seguinte',
    pickerCalendarGroup: 'Calendário',
    screenBack: 'Voltar',
    screenChooseDay: 'Escolher um dia',
    screenToday: 'Hoje',
    today: 'Hoje',
    signOut: 'Sair',
    ariaYesterday: 'Dia anterior (ontem)',
    ariaTomorrow: 'Dia seguinte (amanhã)',
    ariaOpenCalendar: 'Abrir calendário para escolher o dia',
    loadingDay: 'A carregar o dia…',
    loadingSession: 'A iniciar sessão…',
    taskDone: 'Concluída',
    taskTodo: 'Por fazer',
    taskPlaceholder: 'Tarefa…',
    ariaTaskText: 'Texto da tarefa',
    ariaMarkTodo: 'Marcar como por fazer',
    ariaMarkDone: 'Marcar como concluída',
    ariaAddField: 'Adicionar campo',
    readOnlyPastDay: 'Este dia já passou — só podes consultar as tarefas; não é possível alterar nem guardar.',
    monthlyPendingTitle: 'Pendentes do mês',
    monthlyPendingCount: '{{count}} pendentes em {{month}}',
    monthlyPendingEmpty: 'Sem tarefas pendentes neste mês.',
    moveToToday: 'Mover para hoje',
    movedToToday: 'Tarefa movida para hoje.',
    moveAllToToday: 'Mover todas para hoje',
    movedAllToToday: 'Todas as tarefas pendentes foram movidas para hoje.',
    confirmMoveAllToToday: 'Queres mesmo mover todas as tarefas pendentes para hoje?',
    save: 'Guardar',
    saved: 'Guardado.',
    setupTitle: 'Configurar Supabase',
    setupP1a: 'Para login com email e tarefas na nuvem, cria um projeto gratuito em ',
    setupP1b: ' e adiciona um ficheiro ',
    setupP1c: ' na raiz do projeto.',
    setupP2:
      'No painel do Supabase, executa o SQL do ficheiro supabase-schema.sql. Instruções passo a passo: SUPABASE_SETUP.txt.',
    setupP3: 'Reinicia o servidor de desenvolvimento (npm run dev) depois de criar o .env.',
    authSubtitleLogin: 'Entrar com email',
    authSubtitleRegister: 'Criar conta com email',
    authEmail: 'Email',
    authPassword: 'Palavra-passe',
    authConfirmPassword: 'Confirmar palavra-passe',
    authSubmitLogin: 'Entrar',
    authSubmitRegister: 'Registar',
    authBusy: 'A aguardar…',
    authToggleToRegister: 'Não tens conta? Registar',
    authToggleToLogin: 'Já tens conta? Entrar',
    authPasswordMismatch: 'As palavras-passe não coincidem.',
    authPasswordMin: 'A palavra-passe deve ter pelo menos 6 caracteres.',
    authSignupSuccess:
      'Conta criada. Se o projeto pedir confirmação por email, verifica a caixa de entrada antes de entrar.',
  },
  en: {
    dateLocale: 'en-GB',
    weekdayShort: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    appTitle: 'ToDoDay',
    documentTitle: 'ToDoDay — Planner',
    calendarOpenTitle: 'Open calendar',
    calendarPrevMonth: 'Previous month',
    calendarNextMonth: 'Next month',
    pickerCalendarGroup: 'Calendar',
    screenBack: 'Back',
    screenChooseDay: 'Choose a day',
    screenToday: 'Today',
    today: 'Today',
    signOut: 'Sign out',
    ariaYesterday: 'Previous day (yesterday)',
    ariaTomorrow: 'Next day (tomorrow)',
    ariaOpenCalendar: 'Open calendar to pick a day',
    loadingDay: 'Loading day…',
    loadingSession: 'Signing in…',
    taskDone: 'Done',
    taskTodo: 'To do',
    taskPlaceholder: 'Task…',
    ariaTaskText: 'Task text',
    ariaMarkTodo: 'Mark as to do',
    ariaMarkDone: 'Mark as done',
    ariaAddField: 'Add field',
    readOnlyPastDay: 'This day is in the past — you can only view tasks; editing and save are disabled.',
    monthlyPendingTitle: 'Monthly pending',
    monthlyPendingCount: '{{count}} pending in {{month}}',
    monthlyPendingEmpty: 'No pending tasks this month.',
    moveToToday: 'Move to today',
    movedToToday: 'Task moved to today.',
    moveAllToToday: 'Move all to today',
    movedAllToToday: 'All pending tasks were moved to today.',
    confirmMoveAllToToday: 'Do you really want to move all pending tasks to today?',
    save: 'Save',
    saved: 'Saved.',
    setupTitle: 'Set up Supabase',
    setupP1a: 'For email login and cloud tasks, create a free project at ',
    setupP1b: ' and add a ',
    setupP1c: ' file at the project root.',
    setupP2:
      'In the Supabase dashboard, run the SQL from supabase-schema.sql. Step-by-step: SUPABASE_SETUP.txt.',
    setupP3: 'Restart the dev server (npm run dev) after creating the .env file.',
    authSubtitleLogin: 'Sign in with email',
    authSubtitleRegister: 'Create an account with email',
    authEmail: 'Email',
    authPassword: 'Password',
    authConfirmPassword: 'Confirm password',
    authSubmitLogin: 'Sign in',
    authSubmitRegister: 'Register',
    authBusy: 'Please wait…',
    authToggleToRegister: 'No account? Register',
    authToggleToLogin: 'Already have an account? Sign in',
    authPasswordMismatch: 'Passwords do not match.',
    authPasswordMin: 'Password must be at least 6 characters.',
    authSignupSuccess:
      'Account created. If the project requires email confirmation, check your inbox before signing in.',
  },
  fr: {
    dateLocale: 'fr-FR',
    weekdayShort: ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'],
    appTitle: 'ToDoDay',
    documentTitle: 'ToDoDay — Agenda',
    calendarOpenTitle: 'Ouvrir le calendrier',
    calendarPrevMonth: 'Mois précédent',
    calendarNextMonth: 'Mois suivant',
    pickerCalendarGroup: 'Calendrier',
    screenBack: 'Retour',
    screenChooseDay: 'Choisir un jour',
    screenToday: "Aujourd'hui",
    today: "Aujourd'hui",
    signOut: 'Déconnexion',
    ariaYesterday: 'Jour précédent (hier)',
    ariaTomorrow: 'Jour suivant (demain)',
    ariaOpenCalendar: 'Ouvrir le calendrier pour choisir un jour',
    loadingDay: 'Chargement du jour…',
    loadingSession: 'Connexion…',
    taskDone: 'Terminée',
    taskTodo: 'À faire',
    taskPlaceholder: 'Tâche…',
    ariaTaskText: 'Texte de la tâche',
    ariaMarkTodo: 'Marquer comme à faire',
    ariaMarkDone: 'Marquer comme terminée',
    ariaAddField: 'Ajouter un champ',
    readOnlyPastDay:
      'Ce jour est passé — vous pouvez seulement consulter les tâches ; modification et enregistrement désactivés.',
    monthlyPendingTitle: 'En attente du mois',
    monthlyPendingCount: '{{count}} en attente en {{month}}',
    monthlyPendingEmpty: 'Aucune tâche en attente ce mois-ci.',
    moveToToday: "Déplacer à aujourd'hui",
    movedToToday: "Tâche déplacée à aujourd'hui.",
    moveAllToToday: "Tout déplacer à aujourd'hui",
    movedAllToToday: "Toutes les tâches en attente ont été déplacées à aujourd'hui.",
    confirmMoveAllToToday: "Voulez-vous vraiment déplacer toutes les tâches en attente à aujourd'hui ?",
    save: 'Enregistrer',
    saved: 'Enregistré.',
    setupTitle: 'Configurer Supabase',
    setupP1a: 'Pour la connexion par e-mail et les tâches dans le cloud, créez un projet gratuit sur ',
    setupP1b: ' puis ajoutez un fichier ',
    setupP1c: ' à la racine du projet.',
    setupP2:
      'Dans le tableau Supabase, exécutez le SQL du fichier supabase-schema.sql. Étapes : SUPABASE_SETUP.txt.',
    setupP3: 'Redémarrez le serveur de développement (npm run dev) après avoir créé le fichier .env.',
    authSubtitleLogin: 'Connexion avec e-mail',
    authSubtitleRegister: 'Créer un compte avec e-mail',
    authEmail: 'E-mail',
    authPassword: 'Mot de passe',
    authConfirmPassword: 'Confirmer le mot de passe',
    authSubmitLogin: 'Connexion',
    authSubmitRegister: "S'inscrire",
    authBusy: 'Veuillez patienter…',
    authToggleToRegister: 'Pas de compte ? Inscription',
    authToggleToLogin: 'Déjà un compte ? Connexion',
    authPasswordMismatch: 'Les mots de passe ne correspondent pas.',
    authPasswordMin: 'Le mot de passe doit contenir au moins 6 caractères.',
    authSignupSuccess:
      'Compte créé. Si le projet exige une confirmation par e-mail, vérifiez votre boîte avant de vous connecter.',
  },
}
