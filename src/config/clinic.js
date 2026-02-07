// src/config/clinic.js
/**
 * ╔════════════════════════════════════════════════════════════════════╗
 * ║  CÉREBRO DA CLÍNICA — Instituto Sono e Mente                     ║
 * ║                                                                    ║
 * ║  Base de conhecimento completa: dados institucionais, médicos,     ║
 * ║  valores, convênios por profissional, exames, regras de negócio.   ║
 * ║  O agente consulta via RPC e responde qualquer pergunta            ║
 * ║  sem precisar de contexto extra no n8n.                            ║
 * ║                                                                    ║
 * ║  Fonte: CNPJ + levantamento com recepcionistas (jan/2026)          ║
 * ╚════════════════════════════════════════════════════════════════════╝
 */

function env(key, fallback) {
  const v = process.env[key];
  return v !== undefined && v !== "" ? v : fallback;
}

export const CLINIC = {

  /* ═══════════════════════════════════════════════════════════════════
     IDENTIDADE
     ═══════════════════════════════════════════════════════════════════ */
  nomeFantasia:      env("CLINIC_NOME_FANTASIA", "Instituto Sono e Mente"),
  razaoSocial:       env("CLINIC_RAZAO_SOCIAL", "B M Lacerda LTDA"),
  cnpj:              env("CLINIC_CNPJ", "22.100.491/0002-66"),
  porte:             "ME",
  naturezaJuridica:  "206-2 - Sociedade Empresária Limitada",
  dataAbertura:      "2015-10-01",
  situacaoCadastral: "ATIVA",

  cnaePrincipal: {
    codigo: "86.30-5-03",
    descricao: "Atividade médica ambulatorial restrita a consultas",
  },
  cnaeSecundarios: [
    { codigo: "86.30-5-02", descricao: "Atividade médica ambulatorial com recursos para realização de exames complementares" },
    { codigo: "86.50-0-01", descricao: "Atividades de enfermagem" },
  ],

  /* ═══════════════════════════════════════════════════════════════════
     ÁREAS DE ATUAÇÃO
     ═══════════════════════════════════════════════════════════════════ */
  areasAtuacao: [
    "Saúde mental",
    "Medicina do sono",
  ],
  tratamentos: [
    "Insônia",
    "Ronco",
    "Apneia do sono",
    "Sonambulismo",
    "Distúrbios do sono em geral",
    "Depressão",
    "Ansiedade",
    "TDAH",
    "Transtornos psiquiátricos em geral",
  ],
  tiposAtendimento: [
    "Atendimento psiquiátrico",
    "Atendimento psicológico",
    "Atendimento em Medicina do sono",
  ],
  faixaEtaria: "Crianças a partir de 6 anos, adolescentes, adultos e idosos",

  /* ═══════════════════════════════════════════════════════════════════
     UNIDADES
     ═══════════════════════════════════════════════════════════════════ */
  unidades: [
    {
      id: "jp",
      nome: "João Pessoa / PB",
      companyId: 100000,
      endereco: {
        local:       "Liv Mall Shopping — Sala 830",
        logradouro:  "Av. Governador Flávio Ribeiro Coutinho",
        numero:      "500",
        complemento: "Sala 830",
        bairro:      "Jardim Oceania",
        cidade:      "João Pessoa",
        uf:          "PB",
        cep:         "58.037-005",
        get formatado() {
          return `${this.local}\n${this.logradouro}, ${this.numero} — ${this.bairro}, ${this.cidade}/${this.uf}, CEP ${this.cep}`;
        },
        googleMaps: "https://maps.google.com/?q=Av+Governador+Flavio+Ribeiro+Coutinho+500+Sala+830+Joao+Pessoa+PB",
      },
      telefones: [
        "(83) 2179-4549",
        "(83) 2177-0138",
      ],
      whatsapp: {
        numero: "(83) 99851-5460",
        link:   "https://wa.me/5583998515460",
      },
      email: "brunomedjpa@hotmail.com",
      horario: {
        segunda: "08:00-21:00",
        terca:   "08:00-21:00",
        quarta:  "08:00-21:00",
        quinta:  "08:00-21:00",
        sexta:   "08:00-21:00",
        sabado:  "08:00-12:00",
        domingo: "Fechada",
        get formatado() {
          return "Seg a Sex: 08:00 às 21:00 | Sáb: 08:00 às 12:00 | Dom: Fechada";
        },
      },
      convenios: [
        "Amil", "GEAP Saúde", "Afrafep", "Bradesco Saúde",
        "Hapvida", "Stellantis", "Prevmed", "Medservice",
      ],
      aceitaTerapiaConvenio: ["Amil"],
      avaliacaoGoogle: "https://g.page/r/Cd0SLGC4FS0IEBE/review",
    },
    {
      id: "natal",
      nome: "Natal / RN",
      companyId: 2,
      endereco: { formatado: "Natal / RN (detalhes a confirmar)" },
      telefones: [],
      whatsapp: { numero: "", link: "" },
      horario: { formatado: "A confirmar" },
      convenios: [],
    },
    {
      id: "recife",
      nome: "Recife / PE",
      companyId: null,
      endereco: { formatado: "Recife / PE (detalhes a confirmar)" },
      telefones: [],
      whatsapp: { numero: "", link: "" },
      horario: { formatado: "A confirmar" },
      convenios: [],
    },
  ],

  /* ═══════════════════════════════════════════════════════════════════
     MÉDICOS — DETALHES COMPLETOS (unidade JP)
     ═══════════════════════════════════════════════════════════════════ */
  medicos: [
    {
      nome:           "Dr. Bruno Lacerda",
      nomeCompleto:   "BRUNO MOURA LACERDA",
      performerId:    29,
      instagram:      "@dr.bruno.m.lacerda",
      especialidades: ["Psiquiatra", "Medicina do sono"],
      idadeMinima:    6,
      convenios:      ["Particular", "Amil", "GEAP Saúde", "Bradesco Saúde", "Afrafep", "Stellantis", "Medservice"],
      naoAtende:      ["Hapvida", "Prevmed"],
      valores: {
        aVista:    { valor: 400, formas: "Débito ou PIX" },
        parcelado: { valor: 450, formas: "Até 6x no cartão" },
      },
      unidade: "jp",
    },
    {
      nome:           "Dra. Suyane Leite",
      nomeCompleto:   "SUYANE LEITE",
      performerId:    null,
      instagram:      "@drasuyaneleite",
      especialidades: ["Psiquiatra", "Medicina do sono"],
      idadeMinima:    18,
      convenios:      ["Particular", "Amil", "GEAP Saúde", "Bradesco Saúde", "Hapvida", "Prevmed", "Stellantis", "Medservice"],
      naoAtende:      ["Afrafep"],
      valores: {
        aVista:    { valor: 450, formas: "Espécie ou PIX" },
        parcelado: null,
      },
      unidade: "jp",
    },
    {
      nome:           "Dr. Emerson Serafim",
      nomeCompleto:   "EMERSON SERAFIM",
      performerId:    null,
      instagram:      "@dremersonserafim",
      especialidades: ["Psiquiatra", "Medicina do sono"],
      idadeMinima:    null,
      convenios:      ["Particular", "Amil", "GEAP Saúde", "Afrafep", "Bradesco Saúde", "Hapvida", "Stellantis", "Prevmed", "Medservice"],
      naoAtende:      [],
      valores: {
        aVista:    { valor: 550, formas: "Espécie ou PIX" },
        parcelado: null,
      },
      unidade: "jp",
    },
    {
      nome:           "Dra. Maria Lívia Mangueira",
      nomeCompleto:   "MARIA LIVIA MANGUEIRA",
      performerId:    null,
      instagram:      "@dra.livia.mangueira",
      especialidades: ["Psiquiatra", "Medicina do sono"],
      idadeMinima:    15,
      convenios:      ["Particular", "Hapvida"],
      naoAtende:      ["Amil", "GEAP Saúde", "Afrafep", "Bradesco Saúde", "Stellantis", "Prevmed", "Medservice"],
      valores: {
        aVista:    { valor: 450, formas: "Espécie ou PIX" },
        parcelado: null,
      },
      unidade: "jp",
    },
    {
      nome:           "Dr. Hércules Antônio",
      nomeCompleto:   "HERCULES ANTONIO",
      performerId:    null,
      instagram:      "@drherculesantonio",
      especialidades: ["Médico", "Medicina do sono"],
      idadeMinima:    8,
      convenios:      ["Particular", "Hapvida"],
      naoAtende:      ["Amil", "GEAP Saúde", "Afrafep", "Bradesco Saúde", "Stellantis", "Prevmed", "Medservice"],
      valores: {
        aVista:    { valor: 450, formas: "Espécie ou PIX" },
        parcelado: null,
      },
      unidade: "jp",
    },
  ],

  /* ═══════════════════════════════════════════════════════════════════
     EXAMES — DETALHES, VALORES E PREPARO
     ═══════════════════════════════════════════════════════════════════ */
  exames: [
    {
      nome: "Polissonografia",
      descricao: "Realizado no conforto da casa do paciente",
      convenios: ["Amil", "GEAP Saúde", "Afrafep", "Bradesco Saúde", "Hapvida", "Stellantis", "Prevmed", "Medservice"],
      preparo: "O aparelho deve ser devolvido à clínica no dia seguinte, até às 10h.",
      valores: {
        aVista:    { valor: 550, formas: "À vista" },
        parcelado: { valor: 660, formas: "Até 6x no cartão" },
      },
    },
    {
      nome: "Eletroencefalograma (EEG)",
      descricao: "Exame de atividade elétrica cerebral",
      convenios: ["Amil", "GEAP Saúde", "Afrafep", "Bradesco Saúde", "Hapvida", "Stellantis", "Prevmed", "Medservice"],
      preparo: "Cabelos secos, preferencialmente lavados no dia anterior apenas com shampoo. Não usar: condicionador, creme, óleo capilar ou qualquer produto nos cabelos.",
      valores: {
        aVista:    { valor: 200, formas: "À vista" },
        parcelado: { valor: 250, formas: "Até 6x no cartão" },
      },
    },
    {
      nome: "P300 – Potencial Evocado",
      descricao: "Exame de potencial evocado auditivo",
      convenios: ["Amil", "GEAP"],
      preparo: null,
      valores: {
        aVista:    { valor: 250, formas: "À vista" },
        parcelado: { valor: 300, formas: "Até 6x no cartão" },
      },
    },
    {
      nome: "Actigrafia",
      descricao: "Monitoramento de atividade e repouso",
      convenios: ["Particular"],
      preparo: "O aparelho deve ser devolvido à clínica no dia seguinte, até às 10h.",
      valores: {
        aVista:    { valor: 250, formas: "À vista" },
        parcelado: { valor: 300, formas: "Até 6x no cartão" },
      },
    },
  ],

  /* ═══════════════════════════════════════════════════════════════════
     REGRAS DE NEGÓCIO
     ═══════════════════════════════════════════════════════════════════ */
  regras: {
    pagamento: {
      regra: "Todo pagamento é realizado diretamente na recepção da unidade, no dia do atendimento.",
      proibicoes: [
        "Não recebe pagamento antecipado",
        "Não cobra por PIX, transferência, link, boleto ou qualquer outro meio antes do atendimento",
        "Nunca sugerir pagamento antecipado",
        "Nunca informar dados de PIX, contas bancárias, links de pagamento ou boletos",
      ],
      mensagemPadrao: "O pagamento é feito somente na recepção da unidade, no dia da consulta ou exame. Não recebemos nenhum pagamento antecipado.",
    },
    consultas: {
      retorno: "As consultas não incluem direito a retorno. Para nova avaliação, será cobrada nova consulta.",
    },
    whatsapp: {
      regra: "O WhatsApp das unidades recebe apenas mensagens. Não recebemos ligações por WhatsApp.",
      mensagemPadrao: "Utilize o WhatsApp das unidades apenas para mensagens, pois não recebemos ligações por esse canal.",
    },
    feriados: {
      nacionais: "Para feriados nacionais, informar os dias e horários habituais de funcionamento.",
      locais: "Para feriados locais, pontos facultativos ou datas comemorativas, orientar confirmação direta pelo telefone fixo da unidade.",
    },
    foraEscopo: "Quando o assunto não estiver previsto na base de conhecimento, orientar contato direto com os canais oficiais da unidade, enviando o link de WhatsApp.",
    limites: "O agente nunca pode assumir responsabilidade por áreas administrativas, jurídicas, financeiras ou de recursos humanos.",
  },

  /* ═══════════════════════════════════════════════════════════════════
     FORMAS DE PAGAMENTO (no dia, na recepção)
     ═══════════════════════════════════════════════════════════════════ */
  formasPagamento: [
    "Dinheiro (espécie)",
    "PIX (no dia, na recepção)",
    "Cartão de débito",
    "Cartão de crédito (até 6x)",
  ],

  /* ═══════════════════════════════════════════════════════════════════
     MENSAGENS PADRÃO DO AGENTE (SOFIA)
     ═══════════════════════════════════════════════════════════════════ */
  mensagens: {
    saudacao:      env("CLINIC_MSG_SAUDACAO",      "Olá! 😊 Seja bem-vindo(a) ao Instituto Sono e Mente. Como posso ajudar?"),
    foraHorario:   env("CLINIC_MSG_FORA_HORARIO",  "Nosso horário de atendimento é de segunda a sexta, das 08h às 21h, e sábados das 08h às 12h. Deixe sua mensagem que retornaremos assim que possível."),
    despedida:     env("CLINIC_MSG_DESPEDIDA",      "Obrigado pelo contato! Se precisar de algo, estamos à disposição. Até breve! 😊"),
    aguarde:       env("CLINIC_MSG_AGUARDE",        "Um momento, por favor, estou verificando as informações..."),
    pagamento:     "O pagamento é feito somente na recepção da unidade, no dia da consulta ou exame. Não recebemos nenhum pagamento antecipado.",
    whatsappAviso: "Utilize o WhatsApp das unidades apenas para mensagens, pois não recebemos ligações por esse canal.",
  },
};


/* ═══════════════════════════════════════════════════════════════════════
   FUNÇÕES DE CONSULTA — usadas pelo RPC
   ═══════════════════════════════════════════════════════════════════════ */

function normQ(s) {
  return String(s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

/**
 * Busca médico pelo nome (fuzzy) na base local.
 * Retorna info completa: valores, convênios, Instagram, etc.
 */
export function findMedicoLocal(query) {
  if (!query) return null;
  const q = normQ(query);
  return CLINIC.medicos.find(m => {
    const nome = normQ(m.nomeCompleto);
    const apelido = normQ(m.nome);
    return nome.includes(q) || apelido.includes(q) || q.includes(nome.split(" ")[0]);
  }) || null;
}

/**
 * Busca exame pelo nome (fuzzy) na base local.
 */
export function findExameLocal(query) {
  if (!query) return null;
  const q = normQ(query);
  return CLINIC.exames.find(e => {
    const nome = normQ(e.nome);
    return nome.includes(q) || q.includes(nome.split(" ")[0]);
  }) || null;
}

/**
 * Busca unidade por ID ou cidade.
 */
export function findUnidade(query) {
  if (!query) return CLINIC.unidades[0];
  const q = normQ(query);
  return CLINIC.unidades.find(u => {
    const nome = normQ(u.nome);
    return u.id === q || nome.includes(q);
  }) || CLINIC.unidades[0];
}

/**
 * Verifica se médico atende determinado convênio.
 */
export function medicoAtendeConvenio(medicoNome, convenioNome) {
  const medico = findMedicoLocal(medicoNome);
  if (!medico) return { found: false, message: "Médico não encontrado na base." };
  const c = normQ(convenioNome);
  const atende = medico.convenios.some(cv => normQ(cv).includes(c));
  const naoAtende = medico.naoAtende.some(cv => normQ(cv).includes(c));
  return {
    found: true,
    medico: medico.nome,
    convenio: convenioNome,
    atende,
    naoAtende,
    message: atende
      ? `${medico.nome} atende pelo convênio ${convenioNome}.`
      : `${medico.nome} não atende pelo convênio ${convenioNome}.`,
    conveniosAceitos: medico.convenios,
  };
}

/**
 * Retorna um subset dos dados conforme a seção solicitada.
 */
export function getClinicSection(section) {
  switch (section) {
    case "address":
    case "endereco":
      return { unidades: CLINIC.unidades.map(u => ({
        id: u.id, nome: u.nome,
        endereco: u.endereco?.formatado ? { ...u.endereco, formatado: u.endereco.formatado } : u.endereco,
        telefones: u.telefones, whatsapp: u.whatsapp,
      }))};

    case "hours":
    case "horario":
    case "horarios":
      return { unidades: CLINIC.unidades.map(u => ({
        id: u.id, nome: u.nome,
        horario: u.horario?.formatado ? { ...u.horario, formatado: u.horario.formatado } : u.horario,
      }))};

    case "contacts":
    case "contatos":
      return { unidades: CLINIC.unidades.map(u => ({
        id: u.id, nome: u.nome,
        telefones: u.telefones, whatsapp: u.whatsapp, email: u.email,
      }))};

    case "services":
    case "servicos":
      return {
        areasAtuacao: CLINIC.areasAtuacao,
        tiposAtendimento: CLINIC.tiposAtendimento,
        tratamentos: CLINIC.tratamentos,
        faixaEtaria: CLINIC.faixaEtaria,
      };

    case "doctors":
    case "medicos":
      return { medicos: CLINIC.medicos };

    case "exams":
    case "exames":
      return { exames: CLINIC.exames };

    case "insurance":
    case "convenios":
      return { unidades: CLINIC.unidades.map(u => ({
        id: u.id, nome: u.nome, convenios: u.convenios,
      }))};

    case "payment":
    case "pagamento":
      return {
        formasPagamento: CLINIC.formasPagamento,
        regra: CLINIC.regras.pagamento,
      };

    case "rules":
    case "regras":
      return { regras: CLINIC.regras };

    case "instructions":
    case "instrucoes":
      return { exames: CLINIC.exames.map(e => ({
        nome: e.nome, preparo: e.preparo,
      }))};

    case "messages":
    case "mensagens":
      return { mensagens: CLINIC.mensagens };

    case "values":
    case "valores":
      return {
        medicos: CLINIC.medicos.map(m => ({
          nome: m.nome, valores: m.valores,
        })),
        exames: CLINIC.exames.map(e => ({
          nome: e.nome, valores: e.valores,
        })),
      };

    case "identity":
    case "identidade":
      return {
        nomeFantasia: CLINIC.nomeFantasia,
        razaoSocial: CLINIC.razaoSocial,
        cnpj: CLINIC.cnpj,
        porte: CLINIC.porte,
        cnaePrincipal: CLINIC.cnaePrincipal,
      };

    case "all":
    case "full":
    default:
      return {
        ...CLINIC,
        unidades: CLINIC.unidades.map(u => ({
          ...u,
          endereco: u.endereco?.formatado ? { ...u.endereco, formatado: u.endereco.formatado } : u.endereco,
          horario: u.horario?.formatado ? { ...u.horario, formatado: u.horario.formatado } : u.horario,
        })),
      };
  }
}