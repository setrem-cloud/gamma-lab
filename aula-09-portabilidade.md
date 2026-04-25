# Aula 09 — Portabilidade e Lock-in
## Equipe Gamma — Variante: Escala

**Membros e papéis:**
| Nome | Papel |
|------|-------|
| Alisson Barth Pinto | Escriba |
| Cristiano Jardel Hübner | Cronometrista |
| Diogo Werlang | ADR Owner |
| Marcelo Reis | Revisor (peer review até 22h) |
| Victor Grübler | Participante |

**Branch:** `aula-09-portabilidade`  
**Data:** 24 de abril de 2026

---

## Etapa 1 — Reconstruir o Raciocínio (Engenharia Reversa)

Para cada decisão da equipe Agro Digital, reconstruímos o raciocínio por trás da escolha:

| # | Decisão Implementada | Alternativa Óbvia | Por quê? |
|---|---------------------|-------------------|----------|
| 1 | Containerizar ANTES de migrar (Fase 2) | Lift-and-shift direto para Azure | A equipe tinha 0 experiência com Azure e 4 Lambdas complexas sem equivalente direto. Containerizar primeiro criou um artefato portável (imagem OCI) que roda em qualquer orquestrador — reduzindo o risco técnico de reescrever em plataforma desconhecida. O custo de containerizar antecipado foi compensado pela redução do risco de falha durante o cut-over: com containers, o rollback para AWS seria viável sem reescrita. |
| 2 | Auth0 (SaaS neutro) em vez de Azure AD B2C | Azure AD B2C (nativo do provedor destino) | Cognito já era lock-in técnico na AWS; escolher Azure AD B2C trocaria um lock-in por outro. Auth0 é SaaS neutro de autenticação: se no futuro houver nova migração (para GCP ou on-premise), o custo de troca de autenticação seria muito menor. A equipe com 0 experiência Azure também reduz risco operacional — Auth0 tem documentação mais acessível e curva de aprendizado menor do que Azure AD B2C. |
| 3 | 4 Lambdas complexas → containers, 8 simples → Azure Functions | Migrar todas 12 para Azure Functions | O prazo de 6 meses e a competência da equipe (sem experiência Azure) tornavam inviável reescrever 12 Lambdas para Azure Functions. As 8 simples tinham interface similar (reescrita parcial aceitável). As 4 complexas tinham lógica de negócio intricada — containerizá-las preservou o código existente sem reescrita completa, reduzindo o risco de regressões e respeitando a janela de migração. |
| 4 | Dual-running por 3 semanas | Cutover big-bang no fim de semana | Com 15.000 fazendas ativas, um big-bang representa risco crítico: qualquer falha de migração derruba toda a operação sem fallback. O dual-running a 10%→30%→70%→100% permite detectar edge cases de autenticação e performance antes de comprometer 100% do tráfego. O custo de R$ 64.000/mês (2x o normal) foi aceito conscientemente como seguro de risco — o downtime de uma falha big-bang custaria reputação e potencialmente mais que isso em clientes perdidos. |
| 5 | Descontinuar 12 recursos (26%) | Migrar tudo | 5 recursos eram órfãos (ninguém sabia para que serviam), 3 buckets continham logs antigos sem valor operacional e 4 Lambdas de relatórios foram consolidadas em 1 container mais eficiente. Migrar recursos desnecessários consome prazo, aumenta custo de dual-running e introduz dívida técnica no ambiente destino. A descontinuação reduziu de 47 para 28 recursos gerenciados — simplificando operações futuras e reduzindo custo mensal. **Discordância do grupo:** descontinuar os 5 órfãos sem investigação mais profunda foi arriscado — o caso prova isso: 2 Lambdas "órfãs" eram usadas por parceiro externo, causando 3 dias de retrabalho. Faríamos um período de observação de tráfego antes de desligar qualquer recurso "órfão". |
| 6 | Forçar reset de senha dos 2.300 usuários | Implementar bridge de autenticação temporária | O Cognito não exporta senhas (hash proprietário) — tecnicamente não há como transportar as credenciais sem reescrita do algoritmo de hash. Uma bridge de autenticação temporária exigiria manter Cognito ativo em paralelo por meses, aumentando custo e complexidade. O reset forçado foi a decisão mais simples dentro do prazo disponível, mas gerou impacto direto em 2.300 usuários. O trade-off foi: custo de engenharia (bridge) vs. atrito de usuário (reset). A equipe priorizou prazo e custo, aceitando o atrito. |

---

## Etapa 2 — Trade-offs Escondidos

### Tabela de Trade-offs

| Aspecto | Melhorou? | Evidência | Trade-off escondido |
|---------|-----------|-----------|---------------------|
| Custo (R$ 32k → R$ 29.5k) | Parcialmente | Queda de R$ 2.500/mês | A economia mensal é real, mas a migração custou ~R$ 200.000 (dual-running de 3 semanas a R$ 64k/mês = R$ 48k + estimativa de ~R$ 150k em horas da equipe + 1 mês de atraso). O payback é de **80 meses (~6,7 anos)**. O negócio financeiramente só faz sentido se houver outro driver além de custo — no caso, havia: o acordo corporativo foi o verdadeiro motivador, não a economia. |
| Complexidade (47 → 28 recursos) | Sim | Redução de 40% nos recursos gerenciados | A simplificação é real, mas esconde que os 28 recursos do Azure incluem tecnologias heterogêneas: Azure Functions, AKS, Auth0 (SaaS externo), Azure Blob, Azure Service Bus. A complexidade de *tipos* de tecnologia aumentou; a complexidade de *quantidade* diminuiu. Operar AKS com 5 containers + 8 Functions é cognitivamente mais complexo do que 47 recursos homogêneos na AWS. |
| Lock-in | Ambíguo | Saíram da AWS, entraram no Azure | Trocaram lock-in técnico AWS por lock-in técnico Azure (AKS, Azure Functions, Azure Blob, Azure Service Bus). A escolha de Auth0 e containers OCI reduz parcialmente o lock-in de autenticação e computação — mas os dados continuam em Azure Blob e o orquestrador em AKS. O lock-in de skills permanece: a equipe agora conhece Azure, não mais AWS — uma futura migração de volta ou para GCP teria o mesmo ponto de partida. |
| Cobertura de testes (23% → 61%) | Sim | Subida de 38 pontos percentuais | A alta de cobertura não foi planejada como objetivo — foi consequência de que qualquer código containerizado ou reescrito precisava de testes para validação do comportamento na nova plataforma. O processo de migração forçou a equipe a entender o código antigo, e entender o código levou a escrever testes. Isso é efeito colateral positivo, mas não garante que os testes medem as coisas certas — 61% de cobertura de linha é diferente de 61% de cobertura de comportamento crítico. |
| Risco futuro | Misto | 14 ADRs + README produzidos; 9/12 fatores 12-Factor | A documentação produzida (14 ADRs) e a aderência ao 12-Factor (9/12) reduzem drasticamente o risco de um próximo episódio "o Rodrigo sabe tudo". Por outro lado, o risco de dependência de Auth0 como terceiro SaaS agora existe: se Auth0 mudar de preço, for adquirido ou descontinuar o serviço, a plataforma de autenticação precisa de nova migração — com os mesmos problemas de hash de senha. |
| Satisfação dos usuários | Negativo no curto prazo | 2.300 usuários forçados a redefinir senha | O impacto real de um reset forçado é medido em churn: usuários que receberam o e-mail de "redefina sua senha" podem ter interpretado como phishing, simplesmente desistido ou migrado para concorrente. Sem dado explícito no caso, estimamos que mesmo 5% de não-retorno representa 115 contas perdidas — provavelmente a métrica mais dolorosa da migração e a menos monitorada. |

### Respostas às 4 Perguntas Provocativas do Caso

**P1 — O custo caiu R$ 2.500/mês. Quantos meses para ter payback?**

O custo da migração em si foi aproximadamente R$ 200.000: dual-running por 3 semanas (R$ 64k/mês × ~0,75 mês = R$ 48k) mais estimativa conservadora de horas da equipe (4 devs + 1 DBA por 7 meses ≈ R$ 150k em custo de oportunidade/salários) mais o mês de atraso. Com economia de R$ 2.500/mês, o payback é de **80 meses (aproximadamente 6,7 anos)**. Para uma plataforma de tecnologia com ciclo de vida médio de 3-5 anos antes de reescrita significativa, esse payback é economicamente desfavorável. O driver real da decisão foi o acordo corporativo — não a economia.

**P2 — Saíram da AWS mas agora usam AKS + Azure Functions + Azure Blob. Estão MENOS locked-in?**

Não claramente. A migração substituiu lock-in AWS por lock-in Azure em serviços equivalentemente proprietários: Lambda → Azure Functions (reescrita necessária), S3 → Azure Blob (adaptador de SDK), Cognito → Auth0 (ponto positivo: SaaS neutro). A diferença real é que agora têm containers OCI como camada portável para a lógica de negócio principal, e o 12-Factor subiu de 5/12 para 9/12 — o que reduz o custo de uma *próxima* migração. A conclusão correta é: estão com lock-in equivalente no provedor, mas com arquitetura interna mais portável.

**P3 — A cobertura de testes subiu de 23% para 61%. Foi intencional?**

Não foi planejada como objetivo, mas também não foi acidente puro — foi **consequência estrutural do processo de migração**. Containerizar e reescrever código força o desenvolvedor a entender o comportamento do código existente antes de reescrever. Para validar que o container em Azure se comporta igual ao Lambda na AWS, testes automatizados são o único mecanismo confiável. A migração criou um incentivo natural para escrever testes: sem eles, como provar que a reescrita está correta? O efeito colateral positivo foi real, mas não garante qualidade — 61% de cobertura de *linha* pode cobrir caminhos triviais e deixar edge cases críticos sem teste.

**P4 — 2.300 usuários tiveram que redefinir senha. Quantos não voltaram?**

O caso não fornece esse dado, o que por si só é um sinal de que a métrica não foi monitorada. Estimativa conservadora: em migrações forçadas de autenticação com comunicação adequada, o churn típico fica entre 2-8%. Para 2.300 usuários, isso representa entre 46 e 184 contas que podem não ter retornado. Se o CloudPonto tivesse 15.000 fazendas com proporção similar de usuários ativos, o impacto seria de 300 a 1.200 usuários perdidos. O risco real não foi o reset em si, mas a comunicação: usuários que recebem e-mail inesperado de "redefina sua senha" frequentemente descartam como phishing.

### Provocações Adicionais

**P1 — A troca de Cognito por Auth0 reduz ou transfere o lock-in?**

Transfere o lock-in, não elimina. Cognito é lock-in técnico da AWS; Auth0 é lock-in técnico de um SaaS terceiro (atualmente Okta). A natureza do risco muda: com Cognito, o problema era a dependência do ecossistema AWS; com Auth0, o problema passa a ser dependência de um fornecedor de identidade externo que pode mudar preços, ser adquirido ou descontinuar serviços. A vantagem real é que Auth0 é agnóstico de provedor cloud — uma futura migração de Azure para GCP não exige trocar de autenticação. Portanto: reduz o lock-in com o *provedor cloud*, mas cria um novo lock-in com o *fornecedor de identidade*.

**P2 — Em quantos meses a economia de R$ 2.500/mês paga o investimento de ~R$ 200k?**

R$ 200.000 ÷ R$ 2.500/mês = **80 meses (6 anos e 8 meses)**. Não é um bom negócio sob perspectiva financeira isolada. Para ser justificável economicamente, o acordo corporativo que motivou a migração precisaria gerar valor equivalente ou superior em outro eixo — acesso a contratos, integração com sistemas Azure do grupo corporativo, ou redução de risco de compliance. A migração foi uma decisão estratégica disfarçada de decisão técnica.

**P3 — A cobertura de testes subir de 23% para 61% foi coincidência, consequência inevitável ou efeito colateral intencional?**

Foi **efeito colateral estruturalmente inevitável**, não exatamente intencional como meta. Qualquer processo de reescrita de código legado para nova plataforma força o desenvolvedor a especificar comportamento esperado — e a forma mais eficiente de fazer isso em escala é via testes automatizados. O processo de containerização exige validar que o container se comporta como o código original, o que naturalmente resulta em testes. Não foi planejado ("vamos atingir 60% de cobertura"), mas também não foi coincidência — foi consequência previsível de fazer migração de forma responsável.

---

## Etapa 3 — Proposta Alternativa (Variante Gamma: Escala para 150.000 Fazendas)

### Estratégia em 1 frase

> **"Migrar priorizando abstrações portáveis desde o dia 1, com arquitetura multi-tenant stateless preparada para 10x de escala, usando Kubernetes multi-cloud como camada de isolamento de provedor."**

### Top 3 Decisões Diferentes

| # | Decisão real | Nossa decisão alternativa | Justificativa |
|---|-------------|--------------------------|---------------|
| 1 | AKS (Azure Kubernetes Service) como orquestrador | **K8s com Rancher + manifests genéricos (sem features AKS-específicas)** | A 150.000 fazendas, o custo de lock-in em AKS é proporcional à escala. Rancher gerencia clusters K8s em qualquer provedor com os mesmos manifests YAML. Se Azure triplicar preço a essa escala, a migração de AKS para EKS ou GKE seria apenas re-apontar o Rancher — sem reescrever manifests. Custo adicional: ~R$ 5.000/mês para Rancher Enterprise, justificável dado o volume. |
| 2 | Azure Functions para 8 Lambdas simples (lock-in de Functions) | **Todos os workloads em containers — até os "simples"** | A 150.000 fazendas, as 8 Azure Functions que foram escolhidas por simplicidade se tornam gargalo de escala: Functions têm cold start, limites de concorrência e comportamento diferente sob load massivo. Containers com workers K8s escalam horizontalmente de forma previsível e portável. O custo de reescrita das 8 Functions em containers no momento da migração é menor do que o custo de reescrevê-las novamente em uma futura migração. |
| 3 | Auth0 como SaaS externo de autenticação | **Keycloak em container próprio + federação OIDC** | Auth0/Okta a 150.000 fazendas tem custo baseado em MAU (Monthly Active Users) — a preços de mercado, 150.000 usuários representam ~R$ 15.000-25.000/mês só em autenticação. Keycloak é open-source, roda em container OCI, implementa OIDC/OAuth2 padrão e permite portabilidade total de dados de usuário (sem problema de hash proprietário). O custo de operação do Keycloak (infra + manutenção) a essa escala é inferior ao custo do SaaS. |

### O que seria MELHOR na alternativa

- **Portabilidade real verificável:** todos os componentes em containers OCI com manifests K8s genéricos — migração de provedor em semanas, não meses.
- **Custo de autenticação escalável:** Keycloak não cobra por usuário ativo. A 150.000 fazendas, a diferença vs. Auth0 é de dezenas de milhares de reais por mês.
- **Sem cold start a 10x de escala:** workers em containers com auto-scaling K8s HPA são mais previsíveis do que Functions sob carga massiva e sustentada.
- **Exportação de senha possível:** Keycloak usa algoritmos de hash configuráveis e exportáveis — o problema das 2.300 senhas que causou reset forçado não existiria.

### O que seria PIOR

- **Maior complexidade operacional no curto prazo:** Keycloak requer configuração, tuning e manutenção que Auth0/SaaS já entrega gerenciado. Para uma equipe com 0 experiência em Azure (e potencialmente sem experiência em Keycloak), a curva de aprendizado é real.
- **Custo inicial maior:** containerizar as 8 Functions simples exige mais horas de desenvolvimento do que a reescrita direta para Azure Functions. Estimativa: +2 semanas de desenvolvimento = +R$ 20.000-30.000 em custo de equipe.
- **Infra de Keycloak a manter:** alta disponibilidade do Keycloak requer no mínimo 2 replicas + banco de dados dedicado + backup de configuração. Não é complexo, mas é operação adicional que Auth0 eliminava.

### Teste dos 3 critérios

| Teste | Resultado | Justificativa |
|-------|-----------|---------------|
| **"E se?"** (faltar 1 dev) | ✅ Passa | Containers e Keycloak são tecnologias com documentação ampla e comunidade ativa. A perda de 1 dev não paralisa — diferente de um sistema com conhecimento tribal ("o Rodrigo sabe"). |
| **Prazo (6 meses)** | ✅ Passa com ajuste | Containerizar as 8 Functions extras adiciona ~2 semanas. É factível em 6 meses se o sprint de containerização for feito em paralelo ao diagnóstico (semanas 1-4). O Keycloak pode ser configurado nas semanas 3-6 antes do cut-over. |
| **Downside real** | ✅ Identificado honestamente | O downside de Keycloak vs. Auth0 é real: requer operação contínua, tem curva de aprendizado e a responsabilidade de disponibilidade do serviço de autenticação é da equipe, não do SaaS. Em caso de incidente de autenticação, não há suporte de fornecedor. |

---

## Síntese — Parte A: Classificação de Componentes do CloudPonto

Com base na arquitetura definida na Etapa 1 do Projeto Integrador (Aula 05):

| Componente | Tecnologia | Classificação | Justificativa |
|-----------|-----------|---------------|---------------|
| API de Registro de Ponto | AWS Lambda + API Gateway | 🔴 Reescrita | Lambda é função serverless proprietária da AWS. Migração para outro provedor exige reescrita para Azure Functions, GCP Cloud Functions ou containers. API Gateway também tem configuração proprietária. |
| Fila de Desacoplamento | Amazon SQS | 🟡 Adaptável | SQS tem interface similar ao Azure Service Bus e Google Pub/Sub. A migração exige ajuste de SDK e mapeamento de conceitos (queue vs topic), mas a lógica do producer/consumer permanece. |
| Workers de Processamento | ECS Fargate (containers Docker) | 🟢 Portável | Containers OCI rodam em qualquer orquestrador K8s (EKS, AKS, GKE, Rancher). Os manifests de deployment precisam de ajuste mínimo de referências a recursos AWS. |
| Banco de Dados | Amazon RDS PostgreSQL Multi-AZ | 🟢 Portável | PostgreSQL é padrão aberto. Migração para Azure Database for PostgreSQL, GCP Cloud SQL ou instância self-hosted via pg_dump/pg_restore. Sem extensões proprietárias documentadas. |
| Cache de Sessão | Amazon ElastiCache (Redis) | 🟢 Portável | Redis é open-source. ElastiCache é apenas Redis gerenciado. Migração para Azure Cache for Redis, GCP Memorystore ou Redis self-hosted sem alteração de código — apenas URL de conexão. |
| CDN / Assets Estáticos | Amazon CloudFront | 🟡 Adaptável | CloudFront tem configurações proprietárias (behaviors, origin groups, cache policies). Migração para Azure CDN ou Cloudflare exige reconfiguração, mas não reescrita de código. |
| Autenticação | (não definida explicitamente na Etapa 1) | 🔴 Reescrita (se usar Cognito) | Se usar Amazon Cognito, o lock-in é total: hash de senhas proprietário impede portabilidade sem reset forçado dos usuários. Recomendamos Keycloak ou Auth0 desde a Etapa 2. |
| Infraestrutura como Código | Terraform (referenciado na Aula 05) | 🟡 Adaptável | Terraform é multi-cloud, mas os módulos escritos para AWS (aws_lambda, aws_sqs) precisam ser reescritos para o provedor destino. A lógica de IaC é reaproveitável; os recursos específicos, não. |

---

## Síntese — Parte B: Decisão de Maior Risco de Lock-in no CloudPonto

**A decisão de maior risco de lock-in no CloudPonto é o uso de AWS Lambda + API Gateway como camada de processamento da API de registro de ponto.**

Lambda é o componente de maior throughput do sistema — é ele que recebe as 80.000 batidas simultâneas no pico de 08h-09h. Por ser serverless proprietário da AWS, qualquer migração de provedor exige reescrita completa da camada de execução: não existe equivalente direto com mesma semântica de invocação, escalonamento automático e integração com API Gateway em outro provedor. O componente que depende diretamente dessa decisão é toda a cadeia de registro de ponto: API Gateway → Lambda → SQS → Workers ECS. Se Lambda for substituído, os contratos de invocação, os timeouts, os modelos de payload e os gatilhos de integração com SQS precisam ser revalidados. A combinação Lambda + API Gateway representa um lock-in técnico de alto impacto: é o núcleo do negócio (registro de ponto) preso ao runtime proprietário da AWS.

---

## Link para o ADR

📄 [ADR-009-portabilidade.md](./adrs/ADR-009-portabilidade.md)

---

*Entrega referente à Aula 09 — Portabilidade | Etapa 2 do Projeto Integrador | Equipe Gamma — Variante: Escala*
