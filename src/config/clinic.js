// src/config/clinic.js
/**
 * ╔════════════════════════════════════════════════════════════════╗
 * ║  CÉREBRO DA CLÍNICA — Instituto Sono e Mente                 ║
 * ║                                                               ║
 * ║  Dados institucionais centralizados.                          ║
 * ║  O agente consulta via RPC "clinic.info" e responde           ║
 * ║  perguntas sobre endereço, horário, serviços, CNPJ etc.      ║
 * ║  sem precisar de context extra no n8n.                        ║
 * ║                                                               ║
 * ║  Sobreescreva via ENV ou edite direto aqui.                   ║
 * ╚════════════════════════════════════════════════════════════════╝
 */

function env(key, fallback) {
  const v = process.env[key];
  return v !== undefined && v !== "" ? v : fallback;
}

export const CLINIC = {

  /* ─── Identidade ────────────────────────────────────────────── */
  nomeFantasia:    env("CLINIC_NOME_FANTASIA", "Instituto Sono e Mente"),
  razaoSocial:     env("CLINIC_RAZAO_SOCIAL", "B M Lacerda LTDA"),
  cnpj:            env("CLINIC_CNPJ", "22.100.491/0002-66"),
  inscricaoEstadual: env("CLINIC_IE", ""),
  porte:           env("CLINIC_PORTE", "ME"),
  naturezaJuridica: "206-2 - Sociedade Empresária Limitada",
  dataAbertura:    "2015-10-01",
  situacaoCadastral: "ATIVA",

  /* ─── Atividades Econômicas (CNAE) ─────────────────────────── */
  cnaePrincipal: {
    codigo: "86.30-5-03",
    descricao: "Atividade médica ambulatorial restrita a consultas",
  },
  cnaeSecundarios: [
    { codigo: "86.30-5-02", descricao: "Atividade médica ambulatorial com recursos para realização de exames complementares" },
    { codigo: "86.50-0-01", descricao: "Atividades de enfermagem" },
  ],

  /* ─── Endereço ─────────────────────────────────────────────── */
  endereco: {
    logradouro:  env("CLINIC_LOGRADOURO", "Av. Governador Flávio Ribeiro Coutinho"),
    numero:      env("CLINIC_NUMERO", "500"),
    complemento: env("CLINIC_COMPLEMENTO", "Sala 830"),
    bairro:      env("CLINIC_BAIRRO", "Jardim Oceania"),
    cidade:      env("CLINIC_CIDADE", "João Pessoa"),
    uf:          env("CLINIC_UF", "PB"),
    cep:         env("CLINIC_CEP", "58.037-005"),
    pais:        "Brasil",
    // Texto formatado pronto pra o agente mandar pro paciente
    get formatado() {
      return `${this.logradouro}, ${this.numero}, ${this.complemento} — ${this.bairro}, ${this.cidade}/${this.uf}, CEP ${this.cep}`;
    },
    // Google Maps link (opcional)
    googleMaps: env("CLINIC_GOOGLE_MAPS", "https://maps.google.com/?q=Av+Governador+Flavio+Ribeiro+Coutinho+500+Sala+830+Joao+Pessoa+PB"),
    // Referência / ponto de referência
    referencia: env("CLINIC_REFERENCIA", "Empresarial José Cavalcanti de Queiroz, 8º andar"),
  },

  /* ─── Contatos ─────────────────────────────────────────────── */
  contatos: {
    telefone:     env("CLINIC_TELEFONE", "(84) 8773-8393"),
    whatsapp:     env("CLINIC_WHATSAPP", ""),
    email:        env("CLINIC_EMAIL", "brunomedjpa@hotmail.com"),
    instagram:    env("CLINIC_INSTAGRAM", ""),
    site:         env("CLINIC_SITE", ""),
  },

  /* ─── Horários de Funcionamento ─────────────────────────────── */
  horarioFuncionamento: {
    segunda:  env("CLINIC_HOR_SEG", "08:00-18:00"),
    terca:    env("CLINIC_HOR_TER", "08:00-18:00"),
    quarta:   env("CLINIC_HOR_QUA", "08:00-18:00"),
    quinta:   env("CLINIC_HOR_QUI", "08:00-18:00"),
    sexta:    env("CLINIC_HOR_SEX", "08:00-18:00"),
    sabado:   env("CLINIC_HOR_SAB", ""),
    domingo:  env("CLINIC_HOR_DOM", ""),
    feriados: env("CLINIC_HOR_FERIADOS", "Fechado"),
    observacao: env("CLINIC_HOR_OBS", ""),
    // Texto formatado
    get formatado() {
      const dias = [];
      if (this.segunda) dias.push(`Seg: ${this.segunda}`);
      if (this.terca)   dias.push(`Ter: ${this.terca}`);
      if (this.quarta)  dias.push(`Qua: ${this.quarta}`);
      if (this.quinta)  dias.push(`Qui: ${this.quinta}`);
      if (this.sexta)   dias.push(`Sex: ${this.sexta}`);
      if (this.sabado)  dias.push(`Sáb: ${this.sabado}`);
      if (this.domingo) dias.push(`Dom: ${this.domingo}`);
      if (this.feriados) dias.push(`Feriados: ${this.feriados}`);
      return dias.join(" | ");
    },
  },

  /* ─── Especialidades / Serviços Oferecidos ──────────────────── */
  // Lista estática (complementa o que vem da API)
  // Edite conforme a clínica real
  servicos: JSON.parse(env("CLINIC_SERVICOS", JSON.stringify([
    "Psiquiatria",
    "Neurologia",
    "Medicina do Sono",
    "Polissonografia",
    "Eletroencefalograma",
    "Consultas ambulatoriais",
    "Enfermagem",
  ]))),

  /* ─── Convênios aceitos (nomes amigáveis) ───────────────────── */
  conveniosAceitos: JSON.parse(env("CLINIC_CONVENIOS", JSON.stringify([
    "Particular",
    "Unimed",
    "Bradesco Saúde",
    "SulAmérica",
    "Amil",
  ]))),

  /* ─── Formas de pagamento ───────────────────────────────────── */
  formasPagamento: JSON.parse(env("CLINIC_PAGAMENTO", JSON.stringify([
    "Dinheiro",
    "PIX",
    "Cartão de crédito",
    "Cartão de débito",
  ]))),

  /* ─── Instruções para o paciente ─────────────────────────────── */
  instrucoes: {
    primeiraConsulta: env("CLINIC_INSTRUCAO_PRIMEIRA",
      "Chegar 15 minutos antes com documento de identidade, cartão do convênio e exames anteriores."),
    retorno: env("CLINIC_INSTRUCAO_RETORNO",
      "Trazer exames solicitados na consulta anterior."),
    cancelamento: env("CLINIC_INSTRUCAO_CANCELAMENTO",
      "Cancelamentos devem ser feitos com pelo menos 24h de antecedência."),
    polissonografia: env("CLINIC_INSTRUCAO_POLI",
      ""),
    observacaoGeral: env("CLINIC_INSTRUCAO_GERAL", ""),
  },

  /* ─── Responsável técnico ──────────────────────────────────── */
  responsavelTecnico: {
    nome:  env("CLINIC_RT_NOME", ""),
    crm:   env("CLINIC_RT_CRM", ""),
    especialidade: env("CLINIC_RT_ESPECIALIDADE", ""),
  },

  /* ─── Mensagens padrão do agente ────────────────────────────── */
  mensagens: {
    saudacao: env("CLINIC_MSG_SAUDACAO",
      "Olá! 😊 Seja bem-vindo(a) ao Instituto Sono e Mente. Como posso ajudar?"),
    foraHorario: env("CLINIC_MSG_FORA_HORARIO",
      "Nosso horário de atendimento é de segunda a sexta, das 08h às 18h. Deixe sua mensagem que retornaremos assim que possível."),
    despedida: env("CLINIC_MSG_DESPEDIDA",
      "Obrigado pelo contato! Se precisar de algo, estamos à disposição. Até breve! 😊"),
    aguarde: env("CLINIC_MSG_AGUARDE",
      "Um momento, por favor, estou verificando as informações..."),
  },
};

/**
 * Retorna um subset dos dados conforme a seção solicitada.
 * Usado pelo RPC: clinic.info, clinic.address, clinic.hours, etc.
 */
export function getClinicSection(section) {
  switch (section) {
    case "address":
    case "endereco":
      return {
        endereco: { ...CLINIC.endereco, formatado: CLINIC.endereco.formatado },
      };
    case "hours":
    case "horario":
    case "horarios":
      return {
        horarioFuncionamento: { ...CLINIC.horarioFuncionamento, formatado: CLINIC.horarioFuncionamento.formatado },
      };
    case "contacts":
    case "contatos":
      return { contatos: CLINIC.contatos };
    case "services":
    case "servicos":
      return { servicos: CLINIC.servicos, cnaeSecundarios: CLINIC.cnaeSecundarios };
    case "insurance":
    case "convenios":
      return { conveniosAceitos: CLINIC.conveniosAceitos };
    case "payment":
    case "pagamento":
      return { formasPagamento: CLINIC.formasPagamento };
    case "instructions":
    case "instrucoes":
      return { instrucoes: CLINIC.instrucoes };
    case "messages":
    case "mensagens":
      return { mensagens: CLINIC.mensagens };
    case "identity":
    case "identidade":
      return {
        nomeFantasia: CLINIC.nomeFantasia,
        razaoSocial: CLINIC.razaoSocial,
        cnpj: CLINIC.cnpj,
        porte: CLINIC.porte,
        dataAbertura: CLINIC.dataAbertura,
        situacaoCadastral: CLINIC.situacaoCadastral,
        cnaePrincipal: CLINIC.cnaePrincipal,
      };
    case "all":
    case "full":
    default:
      // Retorna tudo com getters resolvidos
      return {
        ...CLINIC,
        endereco: { ...CLINIC.endereco, formatado: CLINIC.endereco.formatado },
        horarioFuncionamento: { ...CLINIC.horarioFuncionamento, formatado: CLINIC.horarioFuncionamento.formatado },
      };
  }
}
