# Lab 2 — Primeiro Pipeline CI/CD com GitHub Actions

**Disciplina:** Cloud Computing — Engenharia da Computacao, SETREM
**Pre-requisito:** Lab 1 (Kubernetes + Rancher Desktop)
**Duracao:** 50 minutos
**Tecnologia introduzida:** GitHub Actions, Dockerfile multi-stage

---

## Objetivo

Criar um pipeline CI/CD que automatiza testes e build de uma API minima. O pipeline roda no GitHub Actions — o aluno nao precisa executar nenhum comando Docker na maquina local. Ao final, o aluno tera:

1. Uma API com health check e testes automatizados
2. Um pipeline que executa testes automaticamente a cada push
3. Build da imagem de container como estagio do pipeline (so roda se testes passam)
4. Branch protection ativa na `main`

> **Onde entra o Kubernetes?** Neste lab o pipeline apenas **valida** que a imagem builda corretamente. O deploy no Rancher Desktop com GitOps (ArgoCD) sera feito no **Lab 3**.

---

## Onde fazer este lab

Este lab e feito no repositorio de **labs** da equipe na org:

```
github.com/setrem-cloud/<equipe>-labs/
  lab2/          ← este lab
  lab3/          ← proximo lab
```

> **Nao confundir** com o repo do projeto (`setrem-cloud/<equipe>`). Labs sao exercicios de aprendizado; o projeto e o CloudPonto.

---

## Estrutura dos Arquivos

```
lab2/
  api/
    server.js          # API minima com /healthz e /ready
    package.json       # Dependencias
    test/
      health.test.js   # Testes automatizados
  .github/
    workflows/
      ci.yml           # Pipeline GitHub Actions
  k8s/
    deployment.yaml    # Deployment + Service (referencia para o Lab 3)
  Dockerfile           # Multi-stage build (usado pelo pipeline)
  .dockerignore        # Arquivos excluidos do build
```

---

## Passo a Passo

### Parte 1 — Entender a API (5 min)

Antes de automatizar, entenda o que sera automatizado.

```bash
# Entrar na pasta da API
cd lab2/api

# Instalar dependencias
npm install

# Rodar a API localmente
npm start
# Acesse http://localhost:8080/healthz no navegador

# Rodar os testes
npm test
```

**Ponto de verificacao:** Os testes devem passar com 2 checks verdes.

---

### Parte 2 — Entender o Dockerfile e o pipeline (10 min)

Nao vamos rodar Docker localmente. O objetivo e **ler e entender** o que o pipeline vai executar automaticamente.

**Abra o arquivo `Dockerfile` e observe:**

1. **Multi-stage build** — duas etapas (`FROM ... AS builder` e `FROM ...`). Por que isso reduz o tamanho da imagem?
2. **Usuario nao-root** (`USER appuser`) — boa pratica de seguranca
3. **HEALTHCHECK** — o container sabe verificar se a aplicacao esta saudavel

**Abra o arquivo `.github/workflows/ci.yml` e observe:**

1. **Job `test`** — instala dependencias e roda `npm test`
2. **Job `build`** — so executa se os testes passam (`needs: test`). Faz o build da imagem, verifica o tamanho (< 200MB) e testa se o container responde no `/healthz`
3. **`if: github.ref == 'refs/heads/main'`** — o build so roda em pushes na `main`, nao em branches

> **Importante:** Esse build acontece nos servidores do GitHub, nao na sua maquina. No Lab 3, o pipeline vai alem: publica a imagem no GHCR (GitHub Container Registry) e o ArgoCD faz o deploy no Rancher Desktop automaticamente.

**Ponto de verificacao:** O aluno deve conseguir explicar o fluxo: push → testes → build → validacao.

---

### Parte 3 — Subir para o repositorio de labs da equipe (15 min)

1. Clonar o repo de labs da equipe (ja criado na org):

```bash
git clone https://github.com/setrem-cloud/<equipe>-labs.git
cd <equipe>-labs
```

2. Copiar os arquivos do lab2:

```bash
# Copiar arquivos (ajustar caminho conforme necessario)
cp -r /caminho/para/lab2/api ./lab2/
cp -r /caminho/para/lab2/.github .
cp -r /caminho/para/lab2/k8s ./lab2/
cp /caminho/para/lab2/Dockerfile ./lab2/
cp /caminho/para/lab2/.dockerignore ./lab2/

# Criar .gitignore se nao existir
echo "node_modules/" >> .gitignore
echo ".env" >> .gitignore
```

> **Nota sobre o pipeline:** O arquivo `.github/workflows/ci.yml` fica na raiz do repo (nao dentro de `lab2/`), pois o GitHub Actions so reconhece workflows em `.github/workflows/`. O `working-directory` dentro do ci.yml ja aponta para a pasta correta.

3. Commit e push:

```bash
git add .
git commit -m "ci: lab2 - pipeline CI/CD com GitHub Actions"
git branch -M main
git push origin main
```

4. Ir para a aba **Actions** no GitHub e observar o pipeline rodando

**Ponto de verificacao:** O workflow deve mostrar 2 jobs — `test` (verde) e `build` (verde).

---

### Parte 4 — Provocar uma falha (10 min)

O objetivo e ver o pipeline **protegendo** o codigo.

1. Crie um branch e quebre um teste:

```bash
git checkout -b feature/quebrar-teste
```

2. Edite `lab2/api/server.js` — mude a rota `/healthz` para retornar status 500:

```javascript
// ANTES
res.statusCode = 200;
res.end(JSON.stringify({ status: 'ok' }));
// DEPOIS (proposital)
res.statusCode = 500;
res.end(JSON.stringify({ status: 'broken' }));
```

3. Faca commit e push:

```bash
git add .
git commit -m "test: provocar falha no pipeline"
git push origin feature/quebrar-teste
```

4. No GitHub, crie um **Pull Request (PR)** — uma solicitacao de mesclagem:
   - E um pedido para mesclar as mudancas do seu branch na `main`
   - O pipeline roda automaticamente e mostra se as mudancas quebram algo
   - Va em **Pull Requests > New Pull Request**
   - Base: `main`, Compare: `feature/quebrar-teste`

5. Observe o pipeline falhar — o check vermelho **impede a mesclagem**

**Ponto de verificacao:** O PR deve mostrar check vermelho.

---

### Parte 5 — Ativar branch protection (5 min)

1. No GitHub: **Settings > Branches > Add branch protection rule**
2. Branch name pattern: `main`
3. Marcar:
   - Require a pull request before merging
   - Require status checks to pass before merging
   - Selecionar `test` nos status checks
4. Salvar

**Ponto de verificacao:** Push direto na `main` deve ser bloqueado.

---

### Desafio Extra (para quem terminou)

Escolha UM:

**A — Badge no README:** Adicione o badge de status:
```markdown
![CI](https://github.com/setrem-cloud/<equipe>-labs/actions/workflows/ci.yml/badge.svg)
```

**B — Adicionar PostgreSQL ao pipeline:** Consulte o arquivo `ci.yml` — o bloco de services com Postgres esta comentado. Descomente e faca funcionar.

**C — Notificacao de falha:** Adicione um step que so roda quando o pipeline falha (ver `if: failure()` na documentacao do GitHub Actions).

---

## Entrega

| Item | Como verificar |
|------|---------------|
| Pipeline com 2 jobs (`test` + `build`) | Aba Actions no repo `<equipe>-labs` — ultimo run verde |
| Branch protection na `main` | Settings > Branches |
| Pelo menos 1 PR com CI executado | Aba Pull Requests |

---

## Troubleshooting

| Erro | Causa provavel | Solucao |
|------|---------------|---------|
| Pipeline nao aparece na aba Actions | YAML no caminho errado | Deve estar em `.github/workflows/ci.yml` na raiz do repo |
| YAML parse error | Tabs em vez de espacos | Usar 2 espacos, validar em yamlchecker.com |
| Testes passam local, falham no CI | Versao do Node diferente | Verificar `node-version` no ci.yml |
| Build falha no pipeline | `.dockerignore` ausente | Verificar se copiou o `.dockerignore` |
| `needs: test` — build nao roda | Push foi em branch, nao em `main` | O `if` bloqueia. Fazer merge via PR |
| Membro sem acesso ao repo | Nao esta no Team da equipe | Professor adiciona via org Settings > Teams |
