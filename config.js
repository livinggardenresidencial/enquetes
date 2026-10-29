// Configuração do site. Preencha com os dados do projeto no Supabase
// (Project Settings > API). Esta chave é a pública ("anon" ou "publishable"):
// pode ficar visível, pois as regras do banco limitam o que ela faz.
// NUNCA coloque aqui a chave "service_role" / "secret".
window.ENQUETE_CONFIG = {
  condominio: "Residencial Living Garden",
  titulo: "Enquetes dos moradores",
  // Quem pode promover uma enquete; o primeiro é o padrão no painel.
  organizadores: ["Administração", "Comissão de Melhorias"],
  logo: "assets/logo-living-garden.jpg",   // apague esta linha para usar só o nome
  supabaseUrl: "https://ysthxsoeqvayanocepyw.supabase.co",
  supabaseKey: "sb_publishable_UOxXKRnQJOcYQDfO5eQWhg_GdajHi7-",
};
