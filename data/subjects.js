export const subjects = [
  { id: "samfunnsfag", name: "Samfunnsfag", icon: "🌍", description: "Historie, samfunn og demokrati", active: true },
  { id: "matematikk", name: "Matematikk", icon: "➗", description: "Tall, mønstre og problemløsing", active: false },
  { id: "naturfag", name: "Naturfag", icon: "🧪", description: "Natur, kropp og teknologi", active: false },
  { id: "engelsk", name: "Engelsk", icon: "💬", description: "Språk, ord og kultur", active: false },
  { id: "krle", name: "KRLE", icon: "🧭", description: "Religion, livssyn og etikk", active: false },
  { id: "trafikk", name: "Trafikk", icon: "🚦", description: "Trygg og smart i trafikken", active: false }
];

export const quizzes = [
  {
    id: "den-kalde-krigen",
    subjectId: "samfunnsfag",
    title: "Den kalde krigen",
    description: "Stormakter, konflikter og en delt verden",
    questionCount: 10,
    dataPath: "../data/quizzes/samfunnsfag/den-kalde-krigen.js"
  }
];
