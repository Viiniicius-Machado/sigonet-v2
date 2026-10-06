// SIGONET V2 — Estoque dos técnicos (regras puras, sem tela).
//
// Fonte: relatório "Movimentações Técnicos" do Elleven (Syntesis), em CSV. Cada linha é
// uma entrada ou saída de um produto no estoque de um técnico/prestador (coluna "Tecnico").
// O SigoNet guarda o SALDO de cada estoque na data do relatório e subtrai o que o técnico
// apontou nos chamados DEPOIS dessa data:
//     disponível = saldo do relatório − material apontado no SigoNet depois do relatório
// A cada relatório novo importado a conta recomeça (o Elleven já registrou essas saídas).
// O Elleven continua sendo o estoque oficial; isto é o controle do dia a dia.
//
// Vínculo: cada técnico do SigoNet aponta para UM estoque do Elleven (estoque.tecnicos
// guarda "EMPRESA|Nome"). Um estoque pode servir vários técnicos (bolsão da equipe).
var ER = (function () {
  var R = {};
  var normal = function (s) { return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim(); };
  R.normal = normal;
  R.chaveTec = function (empresa, nome) { return String(empresa || '') + '|' + String(nome || ''); };

  // CSV do Elleven: separador vírgula, aspas duplas, linha "sep=," opcional no topo.
  R.lerCsv = function (texto) {
    var t = String(texto || '').replace(/^﻿/, '').replace(/^sep=.\r?\n/, '');
    var linhas = [], campo = '', linha = [], q = false;
    for (var i = 0; i < t.length; i++) {
      var ch = t[i];
      if (q) { if (ch === '"') { if (t[i + 1] === '"') { campo += '"'; i++; } else q = false; } else campo += ch; }
      else if (ch === '"') q = true;
      else if (ch === ',') { linha.push(campo); campo = ''; }
      else if (ch === '\n') { linha.push(campo.replace(/\r$/, '')); linhas.push(linha); linha = []; campo = ''; }
      else campo += ch;
    }
    if (campo || linha.length) { linha.push(campo.replace(/\r$/, '')); linhas.push(linha); }
    var cab = linhas.shift() || [];
    return linhas.filter(function (l) { return l.length > 1; }).map(function (l) { var o = {}; cab.forEach(function (c, k) { o[c.trim()] = l[k]; }); return o; });
  };

  // Data do relatório: a do nome do arquivo ("...data-2026-10-01 10_33_51.csv"); sem ela, a última movimentação.
  R.dataRelatorio = function (arquivo, linhas) {
    var m = /(\d{4}-\d{2}-\d{2})[ T_](\d{2})[_:](\d{2})[_:](\d{2})/.exec(String(arquivo || ''));
    if (m) return m[1] + 'T' + m[2] + ':' + m[3] + ':' + m[4];
    var max = ''; (linhas || []).forEach(function (l) { var d = String(l['Data Movimentação'] || ''); if (d > max) max = d; });
    return max ? max.replace(' ', 'T').slice(0, 19) : '';
  };

  // Linhas → um registro por estoque, com o saldo de cada produto (só os diferentes de zero).
  R.agregar = function (linhas, arquivo) {
    var data = R.dataRelatorio(arquivo, linhas), est = {}, erros = [];
    (linhas || []).forEach(function (l, i) {
      var nome = String(l.Tecnico || '').trim(), cod = String(l['Cod. Produto'] || '').trim(), q = Number(String(l.Quantidade || '').replace(',', '.'));
      var es = String(l['Entrada/Saida'] || '').trim();
      if (!nome || !cod || !isFinite(q)) { erros.push({ linha: i + 2, msg: 'linha sem estoque, produto ou quantidade' }); return; }
      if (!/^entrada$|^sa[ií]da$/i.test(es)) { erros.push({ linha: i + 2, msg: 'tipo de movimento desconhecido: ' + es }); return; }
      var e = est[nome] = est[nome] || { id: nome, nome: nome, itens: {}, movimentos: 0, ultimaMov: '' }; // CPF/CNPJ do relatório não é guardado
      var it = e.itens[cod] = e.itens[cod] || { d: String(l.Produto || ''), un: String(l.Unidade || ''), entradas: 0, saidas: 0, saldo: 0, valor: 0, _dv: '' };
      var dt = String(l['Data Movimentação'] || '');
      if (/^entrada$/i.test(es)) { it.entradas += q; it.saldo += q; } else { it.saidas += q; it.saldo -= q; }
      if (dt >= it._dv) { it._dv = dt; it.valor = Number(String(l.Valor || '').replace(',', '.')) || it.valor; it.d = String(l.Produto || it.d); }
      e.movimentos++; if (dt > e.ultimaMov) e.ultimaMov = dt;
    });
    var lista = Object.keys(est).sort().map(function (k) {
      var e = est[k], itens = {};
      Object.keys(e.itens).sort().forEach(function (c) { var it = e.itens[c]; it.saldo = Math.round(it.saldo * 1000) / 1000; delete it._dv; if (it.saldo !== 0) itens[c] = it; });
      e.itens = itens; return e;
    });
    return { data: data, estoques: lista, erros: erros };
  };

  // Sugestão de vínculo técnico → estoque, pelos nomes (a gestão confirma na tela).
  //  1) o nome do estoque contém o nome do técnico (primeiro + último nome) → "nome";
  //  2) "EMPRESA (APELIDO)": a empresa bate e o apelido começa igual ao primeiro nome → "apelido";
  //  3) a empresa do técnico tem um único estoque → "empresa".
  R.sugerirVinculos = function (estoques, tecnicos) {
    var out = {};
    var ests = (estoques || []).map(function (e) {
      var m = /^(.*?)\s*\(([^)]*)\)/.exec(e.nome);
      return { id: e.id, n: normal(e.nome), base: normal(m ? m[1] : e.nome).replace(/\b\d+\b/g, '').trim(), apelido: m ? normal(m[2]) : '', ult: e.ultimaMov || '' };
    });
    // Mesmo técnico com dois estoques no Elleven (ex.: "Fulano" e "123 FULANO"): fica o de movimentação mais recente.
    var maisRecente = function (l) { return l.slice().sort(function (a, b) { return b.ult.localeCompare(a.ult); })[0]; };
    // Apelido com letras trocadas ("KHLEYTON" × "Klheyton"): mesmas 4 primeiras letras, em qualquer ordem.
    var pareceApelido = function (ap, prim) {
      ap = ap.split(' ')[0]; if (!ap || ap[0] !== prim[0]) return false;
      return ap.slice(0, 3) === prim.slice(0, 3) || ap.slice(0, 4).split('').sort().join('') === prim.slice(0, 4).split('').sort().join('');
    };
    var daEmpresa = function (emp) {
      var en = normal(emp).replace(/\b(telecom|telecomunicacoes|ltda|servicos|service)\b/g, '').trim();
      if (!en) return [];
      return ests.filter(function (x) { return (' ' + x.base + ' ').indexOf(' ' + en + ' ') >= 0 || (' ' + x.n + ' ').indexOf(' ' + en + ' ') >= 0; });
    };
    (tecnicos || []).forEach(function (t) {
      var k = R.chaveTec(t.empresa, t.nome), p = normal(t.nome).split(' ').filter(function (x) { return x.length > 2; });
      if (!p.length) return;
      var prim = p[0], ult = p[p.length - 1];
      var porNome = ests.filter(function (x) { var w = ' ' + x.n + ' '; return w.indexOf(' ' + prim + ' ') >= 0 && (p.length === 1 || w.indexOf(' ' + ult + ' ') >= 0); });
      if (porNome.length) { out[k] = { id: maisRecente(porNome).id, motivo: 'nome' }; return; }
      var emp = daEmpresa(t.empresa);
      var porApelido = emp.filter(function (x) { return x.apelido && pareceApelido(x.apelido, prim); });
      if (porApelido.length) { out[k] = { id: maisRecente(porApelido).id, motivo: 'apelido' }; return; }
      if (emp.length === 1) out[k] = { id: emp[0].id, motivo: 'empresa' };
    });
    return out;
  };

  // Estoque vinculado a um técnico (ou null).
  R.estoqueDe = function (estoques, empresa, nome) {
    var k = R.chaveTec(empresa, nome);
    return (estoques || []).filter(function (e) { return (e.tecnicos || []).indexOf(k) >= 0; })[0] || null;
  };

  // Material apontado no SigoNet que sai deste estoque depois do relatório: cod → { qtd, regs[] }.
  // Conta todo registro com itens (não conta "nenhum material utilizado").
  R.usadoNoSigonet = function (estoque, materiais, ignorarId) {
    var out = {}, ini = estoque && estoque.relatorio && estoque.relatorio.data ? new Date(estoque.relatorio.data).getTime() : null;
    var tecs = (estoque && estoque.tecnicos) || [];
    (materiais || []).forEach(function (m) {
      if (!m || m.id === ignorarId || m.status === 'SEM_MATERIAL' || !(m.itens || []).length) return;
      var cab = m.cab || {}; if (tecs.indexOf(R.chaveTec(cab.empresa, cab.tecnico)) < 0) return;
      var t = new Date(m.registradoEm || m.criadoEm || 0).getTime();
      if (ini != null && !(t > ini)) return;
      m.itens.forEach(function (i) { var q = Number(i.qtd) || 0; if (!q) return; var x = out[i.cod] = out[i.cod] || { qtd: 0, regs: [] }; x.qtd += q; if (x.regs.indexOf(m.id) < 0) x.regs.push(m.id); });
    });
    return out;
  };

  // Saldo do relatório, usado no SigoNet e disponível, por produto (inclui o que foi usado sem ter saldo).
  R.disponivel = function (estoque, materiais, ignorarId) {
    var usado = R.usadoNoSigonet(estoque, materiais, ignorarId), itens = (estoque && estoque.itens) || {}, cods = {};
    Object.keys(itens).forEach(function (c) { cods[c] = true; }); Object.keys(usado).forEach(function (c) { cods[c] = true; });
    return Object.keys(cods).map(function (c) {
      var it = itens[c] || {}, u = usado[c] ? usado[c].qtd : 0, s = Number(it.saldo) || 0;
      return { cod: c, d: it.d || '', un: it.un || '', valor: Number(it.valor) || 0, saldo: s, usado: u, disp: Math.round((s - u) * 1000) / 1000, regs: usado[c] ? usado[c].regs : [] };
    }).sort(function (a, b) { return a.d.localeCompare(b.d); });
  };

  return R;
})();
if (typeof SN !== 'undefined') SN.ER = ER;
if (typeof module !== 'undefined' && module.exports) module.exports = ER;
