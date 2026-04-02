# 🏛️ Monitor Proposições DF — CLDF

Monitora automaticamente a Câmara Legislativa do Distrito Federal e envia email quando há proposições novas. Roda **4x por dia** via GitHub Actions (8h, 12h, 17h e 21h, horário de Brasília).

---

## Como funciona

1. O GitHub Actions roda o script nos horários configurados
2. O script faz GET na página pública da CLDF (Liferay, sem reCAPTCHA)
3. Extrai as proposições mais recentes do ano via parse de HTML
4. Compara com as já registradas no `estado.json`
5. Se há proposições novas → envia email com a lista organizada por tipo
6. Salva o estado atualizado no repositório

**Por que parse HTML e não API?**
A CLDF usa o sistema Liferay que renderiza o conteúdo no servidor — o HTML chega completo, sem chamadas Ajax. Não há API REST pública com filtro por data/ano disponível sem autenticação. O parse é estável e simples.

---

## Estrutura do repositório

```
monitor-proposicoes-df/
├── monitor.js                      # Script principal
├── package.json                    # Dependências (só nodemailer)
├── estado.json                     # Estado salvo automaticamente pelo workflow
├── README.md                       # Este arquivo
└── .github/
    └── workflows/
        └── monitor.yml             # Workflow do GitHub Actions
```

---

## Setup — Passo a Passo

### PARTE 1 — Preparar o Gmail

**1.1** Acesse [myaccount.google.com/security](https://myaccount.google.com/security)

**1.2** Certifique-se de que a **Verificação em duas etapas** está ativa.

**1.3** Procure por **"Senhas de app"** e clique.

**1.4** Digite um nome (ex: `monitor-cldf`) e clique em **Criar**.

**1.5** Copie a senha de **16 letras** gerada — ela só aparece uma vez.

> Se já tem senha de app do monitor do PR, pode reutilizá-la.

---

### PARTE 2 — Criar o repositório no GitHub

**2.1** Acesse [github.com](https://github.com) → **+ → New repository**

**2.2** Preencha:
- **Repository name:** `monitor-proposicoes-df`
- **Visibility:** Private

**2.3** Clique em **Create repository**

---

### PARTE 3 — Fazer upload dos arquivos

**3.1** Clique em **"uploading an existing file"**

**3.2** Faça upload de:
```
monitor.js
package.json
README.md
```
Commit changes.

**3.3** Crie o workflow: **Add file → Create new file**, nome:
```
.github/workflows/monitor.yml
```
Cole o conteúdo do `monitor.yml` e commit.

---

### PARTE 4 — Configurar os Secrets

**Settings → Secrets and variables → Actions → New repository secret**

| Name | Valor |
|------|-------|
| `EMAIL_REMETENTE` | seu Gmail |
| `EMAIL_SENHA` | senha de 16 letras (sem espaços) |
| `EMAIL_DESTINO` | email destino dos alertas |

---

### PARTE 5 — Testar

**Actions → Monitor Proposições DF → Run workflow → Run workflow**

O **primeiro run** envia email com todas as proposições de 2026 encontradas e salva o estado. A partir do segundo run, só envia se houver novidades.

---

## Email recebido

```
🏛️ CLDF — 8 nova(s) proposição(ões)

IND — 5 proposição(ões)
  10130/2026 | Dep. Pastor Daniel | 01/04/2026 | Sugere UPA na 26 de Setembro...
  10129/2026 | Dep. Roriz Neto    | 01/04/2026 | Sugere contêiner de lixo...

PL — 2 proposição(ões)
  2257/2026  | Dep. Pastor Daniel | 01/04/2026 | Estabelece diretrizes...

REQ — 1 proposição(ões)
  2721/2026  | Dep. Dayse Amarilio| 01/04/2026 | Requer informações...
```

---

## Horários de execução

| Horário BRT | Cron UTC |
|-------------|----------|
| 08:00       | 0 11 * * * |
| 12:00       | 0 15 * * * |
| 17:00       | 0 20 * * * |
| 21:00       | 0 0 * * *  |

---

## Resetar o estado

1. Clique em `estado.json` → lápis
2. Substitua por:
```json
{"proposicoes_vistas":[],"ultima_execucao":""}
```
3. Commit → rode manualmente

---

## API consultada

```
URL: https://www.cl.df.gov.br/pt/web/guest/projetos
Método: GET
Parâmetros: sort=dataLeitura_Number_sortable-&ano=2026&delta=100
Resposta: HTML (Liferay CMS, server-side rendering)
```

Página pública, sem autenticação, sem reCAPTCHA.

---

## Problemas comuns

**Não aparece "Senhas de app" no Google**
→ Ative a verificação em duas etapas primeiro.

**Erro "Authentication failed"**
→ Verifique se `EMAIL_SENHA` foi colado sem espaços.

**Rodou verde mas 0 proposições**
→ Pode ser mudança no HTML da CLDF. Verifique o log completo em Actions e procure por `📄 HTML recebido`.

**Workflow não aparece em Actions**
→ Confirme que o arquivo está em `.github/workflows/monitor.yml`.
