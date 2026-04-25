# ADR-009: Uso de AWS Lambda + API Gateway como camada de execução da API de registro de ponto

## Status
Aceito (com lock-in explicitamente documentado)

## Context

O CloudPonto precisa processar até 80.000 registros de ponto simultâneos no pico de 08h–09h, com latência alvo inferior a 500ms por requisição. A equipe Gamma (Equipe de desenvolvimento da Etapa 2) é pequena, sem ops dedicado, e precisa entregar o produto com foco em features — não em gestão de infraestrutura.

As restrições que pesaram nessa decisão:

- **Equipe reduzida:** sem especialista em infraestrutura, a escolha por serverless (Lambda) elimina gestão de SO, patches e dimensionamento manual de instâncias.
- **Padrão de workload spike:** 80.000 requisições concentradas em 1 hora por dia com baixo volume no restante do dia — o modelo de cobrança por execução do Lambda é mais eficiente do que manter instâncias EC2 provisionadas para o pico 24h/dia.
- **Prazo e time-to-market:** Lambda + API Gateway têm provisionamento em minutos, sem configuração de VPC, load balancer ou ASG, acelerando o ciclo de desenvolvimento.
- **Custo estimado no pico:** ~R$ 0,20/mês para 80.000 execuções Lambda (vs. ~R$ 400+/mês para instâncias EC2 dimensionadas para o pico).

As alternativas consideradas foram: containers ECS Fargate, EC2 com Auto Scaling Group, e API construída com FastAPI em container K8s.

## Decision

Decidimos usar **AWS Lambda como runtime de execução** da API de registro de ponto, exposta via **Amazon API Gateway** (HTTP API). A lógica de negócio do registro de batida (validação, enfileiramento para SQS, resposta ao cliente) roda integralmente em Lambda.

Estamos aceitando conscientemente o seguinte lock-in: o modelo de execução serverless da AWS (Lambda) não tem equivalente com mesma semântica em outros provedores. Uma migração de provedor exigirá reescrita desta camada para Azure Functions, GCP Cloud Functions ou containers — com estimativa de 3 a 6 semanas de engenharia para reescrita + reteste + validação de comportamento sob carga.

## Consequences

### Positivas
- Custo de execução ~R$ 80–120/mês para o pico diário (vs. ~R$ 400+/mês em instâncias permanentes).
- Zero gestão de SO, patches, load balancer e ASG — equipe foca em código de produto.
- Escalonamento automático de 0 a milhares de execuções simultâneas sem configuração.
- Cold start aceitável para o padrão de uso: o pico de 08h–09h mantém instâncias "quentes" durante o burst; fora do pico, cold start de ~200ms é tolerável para operações não-críticas.
- Integração nativa com Amazon SQS como destino de eventos — desacoplamento automático entre API e workers de processamento.

### Negativas — lock-in explícito
- **Lock-in técnico (runtime):** Lambda usa modelo de execução próprio (handler, context, event) incompatível com qualquer outro serverless. Reescrita obrigatória em migração de provedor. Estimativa: 3–6 semanas de engenharia.
- **Lock-in técnico (API Gateway):** configurações de roteamento, authorizers e modelos de payload do API Gateway são proprietários da AWS. Migração exige reconfiguração completa em novo API Gateway (Azure APIM, Kong, Traefik, etc.).
- **Lock-in de skills:** desenvolvedores treinados em Lambda/API Gateway têm conhecimento não-transferível diretamente para Azure Functions ou GCP — existe curva de aprendizado adicional em migração.
- **Limite de timeout:** Lambda tem timeout máximo de 15 minutos. Se o processamento de um registro de ponto precisar de operação longa no futuro (ex.: integração com sistema legado lento), será necessário refatorar para workers ECS — arquitetura que hoje já existe para a fila SQS.

### Mitigação
- **Lógica de negócio isolada:** toda a lógica de validação e enfileiramento está em módulos Python independentes do handler Lambda. Em migração, o handler é a única camada a reescrever — os módulos de domínio são reaproveitados.
- **Contratos via SQS padronizado:** o Lambda não persiste dados diretamente — apenas enfileira mensagens SQS com schema JSON documentado. Isso permite substituir o Lambda por qualquer producer (container, Function, EC2) sem alterar os workers downstream.
- **Infraestrutura como código (Terraform):** os recursos Lambda e API Gateway estão declarados em Terraform. Migração implica escrever novo módulo Terraform para o provedor destino, não reconfigurar manualmente.
- **Avaliação anual:** revisaremos essa decisão anualmente. Se o custo Lambda superar R$ 2.000/mês ou se surgir requisito de migração de provedor, iniciaremos transição para containers ECS Fargate (que já operam como workers na arquitetura atual — curva de aprendizado da equipe já existe).

## Alternatives Considered

| Alternativa | Prós | Contras | Por que foi descartada |
|-------------|------|---------|------------------------|
| **Containers ECS Fargate (FastAPI)** | Portabilidade OCI total; sem lock-in de runtime; comportamento previsível sob carga sustentada; sem cold start | Custo mínimo mesmo sem tráfego (~R$ 50-100/mês por task rodando); requer configuração de load balancer (ALB) + task definitions; complexidade operacional maior | O padrão de spike 08h-09h com baixo volume no restante do dia favorece o modelo pay-per-execution do Lambda. Fargate seria mais indicado se o volume fosse contínuo ao longo do dia. Será reavaliado se o volume crescer acima de 200.000 usuários ativos. |
| **EC2 com Auto Scaling Group (ASG)** | Controle total do ambiente; sem cold start; mesma instância para API e workers | CAPEX de instâncias mínimas sempre ligadas; gestão de SO/patches obrigatória; ASG tem latência de scale-out de 3-5 minutos — insuficiente para spike abrupto de 08h | Descartado pela complexidade operacional incompatível com equipe sem ops dedicado, e pelo custo fixo de instâncias mínimas mesmo em períodos de baixo uso. |
| **Keycloak + FastAPI em K8s (arquitetura totalmente portável)** | Lock-in mínimo; portabilidade total de provedor; Keycloak elimina dependência de Cognito/Auth0; custo de autenticação não baseado em MAU | Complexidade operacional muito maior; requer cluster K8s, configuração de Keycloak, gestão de certificados TLS, Ingress Controller; curva de aprendizado elevada para equipe atual | Arquitetura ideal para escala de 150.000 fazendas, mas prematura para a Etapa 2. Está documentada como alternativa recomendada para a Etapa 3 (Exit Strategy). Será proposta na transição para produção com volume real. |
