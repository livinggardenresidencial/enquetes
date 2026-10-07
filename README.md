# Enquetes da Comissão de Melhorias — Residencial Living Garden

Site para consultar os moradores. O morador escolhe a torre e o apartamento, informa o nome e vota. Cada apartamento vota uma vez por enquete, e todos acompanham o gráfico do resultado pelo mesmo link, sem cadastro, código ou senha.

- **Página dos moradores** (`index.html`): feita primeiro para o celular. O morador escolhe a opção, identifica o apartamento, confere e confirma; recebe um comprovante na tela e vê o gráfico do resultado ao vivo.
- **Painel da administração** (`admin.html`): criar, abrir e encerrar enquetes; ver quem votou e anular votos. Só a comissão entra, com e-mail e senha.
- **Banco de dados** (`supabase/schema.sql`): tabelas, os 85 apartamentos e as regras que garantem um voto por apartamento.

O site fica hospedado no GitHub Pages e os dados no Supabase. Os dois têm plano gratuito suficiente para um condomínio.

> Os nomes dos menus do GitHub e do Supabase mudam de vez em quando. Se algum estiver diferente do descrito aqui, procure o equivalente mais próximo.

---

## Instalação (uma vez só, cerca de 30 minutos)

### 1. E-mail da comissão

Use um e-mail que pertença ao condomínio ou à comissão, não a uma pessoa. As duas contas abaixo ficam nele, o que facilita a troca de gestão.

### 2. Banco de dados no Supabase

1. Crie uma conta em **supabase.com** com esse e-mail.
2. Crie um projeto novo. Em região, escolha **South America (São Paulo)**. Guarde a senha do banco que o site pedir.
3. No menu lateral, abra **SQL Editor**, cole o conteúdo inteiro de `supabase/schema.sql` e clique em **Run**. Deve aparecer "Success". Os apartamentos das duas torres já são cadastrados nesse passo.
4. Crie o usuário que vai administrar as enquetes: **Authentication > Users > Add user**, informe e-mail e senha e marque **Auto Confirm User**.
5. Volte ao **SQL Editor** e rode o comando abaixo, trocando o e-mail pelo do usuário criado:

   ```sql
   insert into public.administradores (user_id)
   select id from auth.users where email = 'comissao@exemplo.com';
   ```

   Para ter mais de um administrador, repita os passos 4 e 5.
6. Recomendado: em **Authentication > Sign In / Providers**, desative a opção que permite novos cadastros (**Allow new users to sign up**). Mesmo ligada, quem se cadastrar não ganha acesso ao painel, mas não há motivo para deixá-la aberta.
7. Em **Project Settings > API** (ou no botão **Connect**), copie dois valores:
   - **Project URL** (algo como `https://abcdefgh.supabase.co`);
   - a chave **pública**, chamada `anon` ou `publishable`.

   Não use a chave `service_role` / `secret`: ela dá acesso total e nunca deve ir para o site.

### 3. Site no GitHub

1. Crie uma conta em **github.com** com o mesmo e-mail.
2. Crie um repositório **público** chamado, por exemplo, `enquetes`. No plano gratuito, o GitHub Pages só funciona em repositório público. Isso não é problema: o código não contém senhas nem dados de moradores.
3. Envie os arquivos: **Add file > Upload files** e arraste todo o conteúdo desta pasta.
   - A pasta `.github` costuma ficar oculta no computador. Se ela não for junto, crie o arquivo pelo próprio GitHub: **Add file > Create new file**, nome `.github/workflows/manter-ativo.yml`, e cole o conteúdo do arquivo de mesmo nome.
4. Abra o arquivo `config.js` no GitHub, clique no lápis e preencha com os dois valores copiados do Supabase:

   ```js
   window.ENQUETE_CONFIG = {
     condominio: "Residencial Living Garden",
     comissao: "Comissão de Melhorias",
     supabaseUrl: "https://abcdefgh.supabase.co",
     supabaseKey: "cole-aqui-a-chave-publica",
   };
   ```

5. Em **Settings > Pages**, escolha **Deploy from a branch**, ramo `main`, pasta `/ (root)`, e salve. Em alguns minutos o site estará em `https://NOME-DA-CONTA.github.io/enquetes/`.

---

## O que o morador encontra

1. **Escolher e identificar.** Toca na opção, na torre, seleciona o apartamento e digita o nome completo.
2. **Conferir.** Uma tela mostra a escolha, o apartamento e o votante antes de registrar. Dá para corrigir.
3. **Comprovante.** Confirmação com a escolha, o apartamento e o horário, mais um botão para convidar os vizinhos pelo WhatsApp com o link da enquete.
4. **Gráfico ao vivo.** Rosca com o total de votos, barras por opção e participação geral e por torre. Atualiza sozinho a cada 10 segundos, sem recarregar.

O aparelho lembra a torre, o apartamento e o nome (se o morador deixar marcado), de modo que nas enquetes seguintes basta escolher a opção e confirmar. Quem prefere menos movimento na tela (configuração de acessibilidade do celular) vê a mesma página sem animações.

O título e a descrição que aparecem quando o link é colado no WhatsApp estão no início do `index.html` (linhas `og:title` e `og:description`).

---

## Rotina de cada enquete

1. Abra `https://NOME-DA-CONTA.github.io/enquetes/admin.html` e entre com o e-mail e a senha do administrador.
2. Preencha **Nova enquete**: pergunta, explicação, opções (uma por linha), data de encerramento (opcional) e se o gráfico aparece durante a votação ou só no fim.
3. A enquete nasce como **rascunho**, invisível aos moradores. Confira e clique em **Abrir votação**.
4. Divulgue o link do site nos canais do condomínio.
5. Acompanhe em **Ver votos**: gráfico, quem votou por cada apartamento e quais unidades faltam em cada torre.
6. Clique em **Encerrar votação** quando quiser, ou deixe o prazo encerrar sozinho. A enquete passa para a seção "Encerradas" do site, com o resultado final.

### Situações comuns

| Situação | O que fazer |
| --- | --- |
| Morador votou errado | **Ver votos > Anular**. O apartamento pode votar de novo. |
| Alguém votou em nome de um apartamento que não é o seu | O morador verá "este apartamento já votou". A comissão confere o nome registrado em **Ver votos**, anula o voto e o morador vota. |
| Erro na pergunta ou nas opções | Exclua o rascunho e crie outro. Depois de aberta, a enquete não é editada, para não mudar o sentido dos votos já dados. |
| Unidade que não deve votar | No Supabase, **SQL Editor**: `update apartamentos set ativo = false where id = 'ARV-101';` (Árvores usa `ARV-`, Frutos usa `FRU-`). |

---

## Apartamentos cadastrados

| Torre | Unidades | Total |
| --- | --- | --- |
| Árvores | 17 andares, finais 01 e 02 (101 a 1702) | 34 |
| Frutos | 17 andares, finais 01 a 03 (101 a 1703) | 51 |
| | | **85** |

A lista está no `schema.sql`. Se a numeração real tiver alguma exceção (cobertura, térreo, andar sem unidade), ajuste ali antes de rodar, ou desative a unidade depois.

---

## Manutenção

- **Pausa do Supabase.** No plano gratuito, projetos sem uso por cerca de uma semana são pausados. O arquivo `.github/workflows/manter-ativo.yml` consulta o banco duas vezes por semana para evitar isso. Se o site parar de carregar as enquetes, entre no Supabase e clique em **Restore project**.
- **Pausa do agendamento do GitHub.** O GitHub desliga tarefas agendadas de repositórios sem alterações por 60 dias e avisa por e-mail. Para religar: aba **Actions > Manter o banco ativo > Enable workflow**.
- **Troca de gestão.** Crie o usuário do novo administrador (passos 4 e 5 da seção 2) e remova o antigo em **Authentication > Users**. Entregue também o acesso ao e-mail da comissão, que controla as duas contas.
- **Cópia dos resultados.** No Supabase, **Table Editor** permite exportar as tabelas `enquetes`, `opcoes` e `votos` em CSV.
- **Atualização do banco.** Se o arquivo `schema.sql` for alterado, rode-o de novo no SQL Editor. Ele pode ser executado várias vezes sem apagar dados.

---

## Como o voto é controlado

- O banco aceita **um voto por apartamento em cada enquete**. A regra está no próprio banco, não só na página.
- Todo voto registra **o nome de quem votou** e o horário.
- O público recebe **apenas os totais**. O nome do votante e o voto de cada apartamento só são visíveis para os administradores cadastrados.
- A chave que fica no `config.js` é pública por natureza. Ela só consegue ler enquetes publicadas, a lista de apartamentos e os totais, e registrar um voto por apartamento.

### Limites que convém conhecer

- **Não há conferência de identidade.** Como não existe código nem login, qualquer pessoa com o link pode votar por qualquer apartamento que ainda não votou, informando qualquer nome. O controle é posterior: o morador prejudicado percebe ao tentar votar, e a comissão vê o nome registrado e anula. Para uma consulta de opinião isso costuma bastar; para uma decisão disputada, considere voltar a exigir um código por apartamento.
- **O voto não é secreto para a comissão.** O painel mostra o que cada apartamento votou, para permitir conferência e correção.
- **É uma consulta, não uma assembleia.** O resultado orienta a comissão e a administração; deliberações que exigem assembleia continuam seguindo a convenção e a lei.
- **Dados guardados:** torre e apartamento, nome informado pelo votante, opção escolhida e horário. Nenhum telefone, e-mail ou documento.

---

## Arquivos

```
index.html                 página dos moradores
admin.html                 painel da administração
config.js                  nome do condomínio, endereço e chave pública do Supabase
assets/estilo.css          aparência
assets/comum.js            funções usadas pelas duas páginas (inclui o gráfico)
assets/app.js              votação
assets/admin.js            painel
supabase/schema.sql        banco de dados, apartamentos e regras de acesso
.github/workflows/manter-ativo.yml   consulta periódica para o banco não pausar
```
