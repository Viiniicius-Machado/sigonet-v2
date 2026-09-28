# SigoNet V2

Sistema Integrado de Gestão Operacional da Netturbo (Field Desk).

Site: https://viiniicius-machado.github.io/sigonet-v2/

É um aplicativo web (HTML, CSS e JavaScript puro, sem framework) com dois públicos:
- a **liderança**, no computador;
- os **técnicos** dos prestadores, no celular.

Os dados ficam numa planilha Google, e um servidor em Google Apps Script faz a ponte com o site. Nomes, CNPJs e budgets **não** ficam neste repositório: vêm da planilha, depois do login.

## Módulos

| Área | O que faz |
|---|---|
| **Chamados (NOC)** | Abertura da OS, classificação pela matriz oficial (SLA e conta contábil), despacho, linha do tempo (MTTD, MTTA, MTTR, SLA), RFO, anexos e PDF do atendimento. |
| **App do técnico** | Fila de OS, aceite, deslocamento, chegada com GPS, fotos com carimbo (estilo Timemark) e conclusão técnica. Tem também a LPU, os materiais e a fibra do atendimento. |
| **Gestão de LPU** | Conferência e aprovação dos itens que o prestador cobra, por conta contábil e budget. |
| **Service Desk, Materiais e Cadastro de Fibra** | Gestões ligadas ao chamado, cada uma com seu ciclo; elas não mexem no MTTR/SLA. |
| **Portal de Gestão** | KPIs do mês nas visões **Global, Rompimento, Massiva e Improdutivas**, com MTTD, MTTA, MTTR, SLA e **IRR** (reincidência por circuito). Exporta para Excel. |
| **Preventiva** | Rotas de preventiva **aérea** (KMZ, metros percorridos, postes, cordoalha, plaquetas, caixas e sobra técnica; meta mensal) e **subterrânea** (vistoria caixa a caixa, com fotos padronizadas e listas fechadas). Telas: Planejamento, Revisão e Dashboard, mais o app do técnico, que funciona offline. A cobrança sai pelo fluxo normal de chamado e LPU. O manual completo (`docs/PREVENTIVA.md`) fica na pasta de trabalho. |
| **Cadastros e Acessos, Auditoria** | Empresas, técnicos, liderança e telas liberadas por pessoa; log de tudo o que foi alterado. |

## Preventiva: como criar as atividades

1. **Pela Preventiva:** Menu **Preventiva → Planejamento → Nova rota**. Escolha *Aérea* ou *Subterrânea*, preencha e clique em **Salvar e despachar**. O chamado Preventiva é criado sozinho e entra na fila do técnico.
2. **A partir de uma OS aberta no NOC:** no chamado do tipo Preventiva, clique em **🧭 Transformar em rota de Preventiva**. A rota fica ligada ao mesmo chamado, sem abrir outro.

Só o que foi **aprovado na Revisão** entra na medição e no pagamento.

## Estrutura

```
index.html        tela única (roteamento por #hash)
css/sigonet.css   tema
js/nucleo.js      base comum (SN): rotas, modais, banco local, sessão
js/servidor.js    sincronização com o Apps Script
js/telas-*.js     telas de cada módulo
js/vistoria-*.js  Preventiva: listas, regras (compartilhadas com o servidor), fila offline, câmera, PDF
js/catalogos.js   matriz de classificação e catálogo de LPU
js/dados.js       versão pública (sem pessoas, CNPJs nem budgets)
```

Este repositório recebe só a parte pública (o site). O código do servidor (Apps Script), os testes e as ferramentas ficam fora dele.

## Publicação

O conteúdo deste repositório é gerado por `node ferramentas/publicar.mjs` a partir da pasta de trabalho. O script troca o `dados.js` pela versão pública e para se algum dado sensível ficar no pacote. Não edite os arquivos daqui à mão. Depois do push, o GitHub Pages atualiza em 1 a 2 minutos.
