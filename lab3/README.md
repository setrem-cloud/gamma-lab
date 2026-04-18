# Lab 3 — GitOps: Deploy Automatico com ArgoCD

**Disciplina:** Cloud Computing — Engenharia da Computacao, SETREM
**Pre-requisito:** Lab 2 (CI/CD com GitHub Actions)
**Duracao:** 75 minutos (pode ser dividido em 2 encontros)
**Tecnologias introduzidas:** GitHub Container Registry (GHCR), ArgoCD

---

## Objetivo

Fechar o ciclo completo de GitOps: um `git push` resulta em deploy automatico no Kubernetes, sem tocar no cluster manualmente.

```
Equipe faz push no repositorio de labs
      |
      v
GitHub Actions roda testes
      |
      v
Pipeline builda a imagem e publica no GHCR (registry)
      |
      v
Pipeline atualiza a tag da imagem no manifest K8s (commit automatico)
      |
      v
ArgoCD detecta o commit e sincroniza o cluster
      |
      v
Rancher Desktop atualiza os pods automaticamente
```

---

## Conceitos-chave

### O que muda em relacao ao Lab 2?

| Lab 2 (CI/CD) | Lab 3 (GitOps) |
|----------------|-----------------|
| Pipeline testa e builda | Pipeline testa, builda **e publica** a imagem |
| Imagem existe so no pipeline | Imagem vai para um **registry** (GHCR) |
| Deploy nao faz parte do lab | **ArgoCD** faz o deploy automaticamente |
| Foco: proteger o codigo | Foco: **entregar** o codigo |

### O que e um registry de imagens?

No Lab 2, o pipeline buildava a imagem para validar o Dockerfile, mas a imagem nao ia para lugar nenhum. Para o Kubernetes puxar a imagem, ela precisa estar em um **registry** — um servidor que armazena e distribui imagens de container.

**GHCR (GitHub Container Registry)** e o registry do proprio GitHub:
- Gratuito para repositorios publicos
- Autenticacao integrada (o pipeline ja tem acesso via `GITHUB_TOKEN`, sem configurar nada extra)
- Endereco: `ghcr.io/setrem-cloud/<equipe>-labs`

### O que e ArgoCD?

ArgoCD e uma ferramenta de GitOps para Kubernetes. Ele faz uma coisa simples:

> "Monitora um repositorio Git. Se os manifests YAML mudaram, aplica as mudancas no cluster."

O repositorio Git vira a **fonte unica de verdade**. Ninguem faz `kubectl apply` manualmente — tudo passa pelo Git.

Duas configuracoes importantes:
- **selfHeal: true** — se alguem alterar algo direto no cluster, o ArgoCD reverte para o que esta no Git
- **prune: true** — se um recurso for removido do Git, o ArgoCD remove do cluster tambem

---

## Onde fazer este lab

Este lab e feito no repositorio de **labs** da equipe na org, dentro da pasta `lab3/`:

```
github.com/setrem-cloud/<equipe>-labs/
  lab2/          ← lab anterior
  lab3/          ← este lab
    api/
    k8s/
    argocd/
    Dockerfile
    .dockerignore
  .github/
    workflows/
      ci.yml     ← pipeline atualizado para lab 3
```

> **Depois de aprender aqui,** a equipe vai aplicar o mesmo fluxo no repo do projeto (`setrem-cloud/<equipe>`) para o CloudPonto.

Nos exemplos, usamos a equipe **gamma**. Substitua pelo nome da sua equipe.

---

## Passo a Passo

### Parte 1 — Preparar o repositorio de labs (10 min)

1. Clonar o repo de labs da equipe (se ainda nao tiver localmente):

```bash
git clone https://github.com/setrem-cloud/gamma-labs.git
cd gamma-labs
```

2. Copiar os arquivos do lab3:

```bash
# Copiar arquivos (ajustar caminho conforme necessario)
cp -r /caminho/para/lab3/api ./lab3/
cp -r /caminho/para/lab3/k8s ./lab3/
cp -r /caminho/para/lab3/argocd ./lab3/
cp /caminho/para/lab3/Dockerfile ./lab3/
cp /caminho/para/lab3/.dockerignore ./lab3/

# Substituir o pipeline do lab2 pelo do lab3 (mais completo)
cp -r /caminho/para/lab3/.github .
```

3. **Editar `lab3/k8s/deployment.yaml`** — substituir pela equipe:

```yaml
image: ghcr.io/setrem-cloud/gamma-labs:latest
```

4. **Editar `lab3/argocd/application.yaml`** — substituir pela equipe:

```yaml
repoURL: https://github.com/setrem-cloud/gamma-labs.git
```

E verificar que o `path` aponta para `lab3/k8s`:

```yaml
path: lab3/k8s
```

5. Commit e push:

```bash
git add .
git commit -m "ci: lab3 - GitOps com ArgoCD e GHCR"
git push origin main
```

6. **Tornar o pacote publico** (apos o primeiro pipeline rodar):
   - GitHub > org `setrem-cloud` > aba **Packages** > `gamma-labs`
   - Package settings > Danger Zone > Change visibility > **Public**

> **Por que publico?** Para o Kubernetes puxar a imagem sem precisar configurar credenciais. Em producao, usariamos um `imagePullSecret`.

---

### Parte 2 — Observar o pipeline completo (10 min)

Acesse a aba **Actions** no repositorio de labs. O pipeline tem 3 jobs:

| Job | O que faz |
|-----|-----------|
| `test` | Instala dependencias e roda `npm test` |
| `build-and-push` | Builda a imagem e publica no GHCR com a tag do commit |
| `update-manifests` | Atualiza a tag da imagem no `lab3/k8s/deployment.yaml` e faz commit |

**Observe o ultimo job (`update-manifests`):** ele altera o `deployment.yaml` com a tag exata do commit. Isso e o que o ArgoCD vai detectar.

**Pontos de verificacao:**
- Os 3 jobs devem estar verdes
- Na aba **Packages** da org, a imagem deve aparecer
- No historico de commits, deve ter um commit automatico do `github-actions[bot]`

---

### Parte 3 — Instalar ArgoCD no Rancher Desktop (15 min)

O ArgoCD roda **dentro** do seu cluster Kubernetes local.

```bash
# Criar namespace do ArgoCD
kubectl create namespace argocd

# Instalar ArgoCD
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# Aguardar pods ficarem prontos (~2 min)
kubectl wait --for=condition=Ready pods --all -n argocd --timeout=180s
```

Verificar que tudo subiu:

```bash
kubectl get pods -n argocd
# Todos devem estar Running
```

### Acessar o painel web do ArgoCD

```bash
# Expor o painel na porta 8443
kubectl port-forward svc/argocd-server -n argocd 8443:443
```

Em outro terminal, pegar a senha do admin:

```bash
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d
echo
```

Acesse no navegador: **https://localhost:8443**
- Usuario: `admin`
- Senha: a que apareceu no comando acima

> **O navegador vai avisar sobre certificado inseguro** — e esperado (certificado auto-assinado). Clique em "Avancado" > "Prosseguir".

**Ponto de verificacao:** Voce esta logado no painel do ArgoCD (tela vazia, sem aplicacoes).

---

### Parte 4 — Conectar ArgoCD ao repositorio de labs (15 min)

Agora vamos dizer ao ArgoCD: "monitore o repositorio de labs da equipe e deploye no cluster".

```bash
kubectl apply -f lab3/argocd/application.yaml
```

**O que esse arquivo faz:**
- `source.repoURL` — repositorio de labs na org (`setrem-cloud/gamma-labs`)
- `source.path: lab3/k8s` — onde estao os manifests YAML
- `destination.server` — qual cluster (o proprio Rancher Desktop)
- `destination.namespace` — namespace da equipe (`equipe-gamma`)
- `syncPolicy.automated` — sincronizar automaticamente quando detectar mudancas

### Verificar no painel

1. Abra o ArgoCD (https://localhost:8443)
2. A aplicacao `lab3-api` deve aparecer
3. Status inicial: **OutOfSync** (ainda nao sincronizou)
4. Clique em **Sync** > **Synchronize**
5. Aguarde os pods subirem — status muda para **Synced** e **Healthy** (verde)

### Verificar no terminal

```bash
# Pods rodando
kubectl get pods -n equipe-gamma
# Deve mostrar 2 pods lab3-api Running

# Servico exposto (LoadBalancer — Rancher Desktop resolve automaticamente)
kubectl get svc -n equipe-gamma
# lab3-api-svc com EXTERNAL-IP (localhost no Rancher Desktop)

# Testar a API
curl http://localhost/
# Deve responder com { app: "Lab 3 - GitOps", versao: "1.0.0", equipe: "gamma", ... }

curl http://localhost/healthz
# { status: "ok" }
```

**Ponto de verificacao:** A API responde em `localhost:80` e o ArgoCD mostra tudo verde.

---

### Parte 5 — O momento magico: GitOps em acao (15 min)

Agora vem o ciclo completo. A equipe vai alterar o codigo e ver o deploy acontecer **sem tocar no cluster**.

#### 5.1 Fazer uma mudanca visivel

Edite `lab3/api/server.js` — mude a versao:

```javascript
// ANTES
versao: '1.0.0',

// DEPOIS
versao: '2.0.0',
```

#### 5.2 Commit e push

```bash
git add lab3/api/server.js
git commit -m "feat: atualizar versao para 2.0.0"
git push origin main
```

#### 5.3 Observar o ciclo completo

1. **GitHub Actions** (aba Actions): pipeline roda testes → builda imagem → publica no GHCR → atualiza tag no `deployment.yaml`
2. **ArgoCD** (painel web): detecta o novo commit → status vira **OutOfSync** → sincroniza automaticamente → pods atualizam
3. **Resultado**: a versao 2.0.0 esta no ar sem ninguem ter feito `kubectl apply`

```bash
# Acompanhar os pods atualizando (rolling update)
kubectl get pods -n equipe-gamma -w
# Pods antigos terminam, novos sobem

# Testar a nova versao
curl http://localhost/
# Deve mostrar versao: "2.0.0"
```

#### 5.4 Testar o selfHeal (bonus)

Tente quebrar algo manualmente no cluster:

```bash
# Deletar um pod "na mao"
kubectl delete pod -n equipe-gamma -l app=lab3-api --wait=false
```

O ArgoCD vai recriar o pod automaticamente (selfHeal). Observe no painel — ele detecta a diferenca e corrige.

**Ponto de verificacao:** A resposta mostra `versao: 2.0.0` — deploy automatico funcionou.

---

### Desafio Extra (para quem terminou)

Escolha UM:

**A — Push manual para o GHCR (entender o que o pipeline faz por baixo)**

No lab, o pipeline publica a imagem automaticamente via `GITHUB_TOKEN`. Mas e se voce quisesse fazer isso na mao? Precisaria de um **PAT (Personal Access Token)** — um token pessoal que da permissao para publicar pacotes.

1. Criar o PAT no GitHub:
   - **Settings > Developer Settings > Personal Access Tokens > Tokens (classic)**
   - Permissoes: `write:packages`, `read:packages`
   - Copiar o token gerado

2. Login no GHCR via terminal:

```bash
echo "SEU_TOKEN" | docker login ghcr.io -u SEU-USUARIO --password-stdin
# Deve mostrar: Login Succeeded
```

3. Build e push manual:

```bash
docker build -t ghcr.io/setrem-cloud/gamma-labs:manual -f lab3/Dockerfile lab3/
docker push ghcr.io/setrem-cloud/gamma-labs:manual
```

4. Verificar em: GitHub > org > aba **Packages**. A tag `manual` deve aparecer ao lado das tags do pipeline.

> **Por que o pipeline nao precisa de PAT?** Porque o `GITHUB_TOKEN` e gerado automaticamente pelo GitHub Actions com permissao para o proprio repositorio. O PAT e necessario apenas para acesso externo (CLI, outro servico).

**B — Rollback via Git**

Simule um deploy com bug e reverta usando Git:

1. Quebre a API (mude `/healthz` para retornar 500), faca push
2. Observe o ArgoCD deployar a versao quebrada
3. Reverta com `git revert HEAD` e faca push
4. Observe o ArgoCD deployar a versao corrigida — sem tocar no cluster

**C — Verificar o prune do ArgoCD**

1. Adicione um ConfigMap qualquer em `lab3/k8s/` e faca push
2. Observe o ArgoCD criar o ConfigMap no cluster
3. Remova o ConfigMap do `lab3/k8s/` e faca push
4. Observe o ArgoCD remover do cluster automaticamente (`prune: true`)

---

## Diagrama do ciclo completo

```
  +-----------+     push      +---------------------------+
  |           | ------------> |                           |
  |  VS Code  |               |  GitHub (org)             |
  |           |               |  setrem-cloud/            |
  +-----------+               |    gamma-labs              |
                              |                           |
                              |  1. Actions roda testes   |
                              |  2. Publica imagem no GHCR|
                              |  3. Atualiza tag no YAML  |
                              +-------------+-------------+
                                            |
                                   commit automatico
                                   (nova tag no manifest)
                                            |
                                            v
  +---------------+            +------------+-------------+
  |               |  detecta   |                          |
  |  Rancher      | <--------- |  ArgoCD                  |
  |  Desktop      |  sincro-   |  (monitora repo de labs) |
  |  (Kubernetes) |  niza      |                          |
  |               |            +--------------------------+
  +-------+-------+
          |
    pods atualizam
    automaticamente
```

> **Proximo passo:** Aplicar este mesmo fluxo no repo do projeto (`setrem-cloud/<equipe>`) para o CloudPonto real.

---

## Entrega

| Item | Como verificar |
|------|---------------|
| Lab no repo de labs da equipe | `github.com/setrem-cloud/<equipe>-labs` — pasta `lab3/` |
| Imagem publicada no GHCR | Aba Packages na org |
| Pipeline com 3 jobs funcionando | Aba Actions — ultimo run verde |
| ArgoCD com aplicacao Synced + Healthy | Screenshot do painel ArgoCD |
| Ciclo GitOps completo | Demonstrar ao professor: mudar codigo → push → pods atualizam sozinhos |

---

## Troubleshooting

| Erro | Causa provavel | Solucao |
|------|---------------|---------|
| Pipeline falha no push para GHCR | Repositorio privado ou permissoes | Verificar que o repo e publico; o `GITHUB_TOKEN` ja tem acesso automatico |
| Imagem nao aparece em Packages | Primeiro push ainda nao completou | Aguardar pipeline terminar; depois tornar o pacote publico |
| ArgoCD nao detecta mudancas | Polling interval padrao e 3 min | Aguardar ou clicar **Refresh** no painel |
| Pods ficam `ImagePullBackOff` | Pacote GHCR ainda privado ou tag errada | Tornar publico em Package Settings; verificar tag no `deployment.yaml` |
| ArgoCD mostra `OutOfSync` mas nao aplica | Auto-sync pode demorar ate 3 min | Clicar **Sync** manual ou aguardar |
| `connection refused` no curl | Service ainda provisionando | Aguardar `kubectl get svc -n equipe-gamma` mostrar EXTERNAL-IP |
| Certificado inseguro no ArgoCD | Esperado — certificado auto-assinado | Clicar "Avancado" > "Prosseguir" no navegador |
| `kubectl port-forward` encerra sozinho | Terminal fechou ou timeout | Rodar o comando novamente |
| Membro sem acesso ao repo | Nao esta no Team da equipe | Professor adiciona via org Settings > Teams |

---

## Limpeza pos-lab

```bash
# Remover aplicacao do ArgoCD
kubectl delete -f lab3/argocd/application.yaml

# Remover ArgoCD
kubectl delete namespace argocd

# Remover namespace da equipe
kubectl delete namespace equipe-gamma
```

> **Nota:** O repositorio na org e os pacotes no GHCR continuam disponiveis. O aprendizado deste lab sera aplicado no repo do projeto (`setrem-cloud/<equipe>`) nas proximas etapas.
