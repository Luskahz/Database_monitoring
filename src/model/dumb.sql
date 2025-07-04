CREATE DATABASE IF NOT EXISTS diretorio;

USE diretorio;

CREATE TABLE
  IF NOT EXISTS `03_11_42` (
    mapa INT,
    veiculo INT,
    placa VARCHAR(20),
    dt_entrega DATE,
    motorista VARCHAR(25),
    km_inicial INT,
    km_final INT,
    km_rodado INT
    
  );

CREATE TABLE
  IF NOT EXISTS `03_11_40` (
    mapa INT,
    veiculo INT,
    placa VARCHAR(20),
    dt_entrega DATE,
    entregas INT,
    hora_emis TIME(0),
    hora_carreg TIME(0),
    hora_saida TIME(0),
    hora_chegada TIME(0),
    hora_p_fis TIME(0),
    hora_p_fin TIME(0),
    tempo_rota TIME(0),
    tempo_p_fis TIME(0),
    tempo_p_fin TIME(0),
    tempo_interno TIME(0),
    km_inicial INT,
    km_final INT,
    km_rodado INT
    
  );

CREATE TABLE
  IF NOT EXISTS `relatorio_separacao_wms` (
    armazem INT,
    mapa INT,
    palete VARCHAR(25),
    entrega DATE,
    inicio_palete DATETIME,
    fim_palete DATETIME,
    execucao_palete_em_segundos INT,
    usuario_finalizou_palete VARCHAR(25),
    finalizado_cfe_indicacao VARCHAR(25),
    endereco_destino VARCHAR(25),
    rtls_hab VARCHAR(10),
    rtls_endereco_destino VARCHAR(10),
    rtls_itens_ok VARCHAR(10),
    peso_do_palete_ok VARCHAR(10),
    peso_palete_esperado INT,
    peso_palete_real VARCHAR(25),
    balanca VARCHAR(25),
    codigo_do_item INT,
    descricao_do_item VARCHAR(25),
    tipo VARCHAR(25),
    peso_esperado DECIMAL(10, 2),
    peso_real DECIMAL(10, 2),
    enderecos_sugeridos VARCHAR(25),
    endereco_selecionado VARCHAR(25),
    quantidade INT,
    unidade_medida VARCHAR(20),
    chapatex INT,
    papelao INT,
    sequencia INT,
    usuario_separacao VARCHAR(25),
    inicio_separacao_item DATETIME,
    fim_separacao_item DATETIME,
    esforco_segundos INT,
    rtls_habilitado_item VARCHAR(10),
    utilizou_rtls_item VARCHAR(10),
    peso_ok_item VARCHAR(25),
    item_conferido VARCHAR(10),
    historico_de_registros VARCHAR(25),
    palete_conferido VARCHAR(10),
    sorteado_para_blitz VARCHAR(10),
    regras_de_blitz_classificadas VARCHAR(25),
    utilizou_percentual_minimo VARCHAR(25),
    palete_iniciado_com_produto VARCHAR(10)
    
  );

CREATE TABLE
  IF NOT EXISTS `03_01_46_06` (
    id_pedido bigint,
    unb bigint,
    cliente bigint,
    razao_social VARCHAR(25),
    data_criacao date,
    hora_criacao time,
    data_entrega date,
    data_ultima_modificacao datetime,
    data_exclusao_cancelamento datetime,
    vendedor int,
    condicao_pagamento int,
    descricao_condicao_pagamento VARCHAR(25),
    indicador_fora_de_rota VARCHAR(10),
    status_exportacao_p VARCHAR(25),
    etapa_pedido VARCHAR(25),
    sem_estoque VARCHAR(25),
    taxa_fora_rota int,
    codigo_pedido_promax bigint,
    data_geracao_arquivo_p DATETIME,
    status_critica VARCHAR(25),
    tipo_solicitacao VARCHAR(25),
    codigo_critica int,
    criticas_magento int,
    alcada_original VARCHAR(25),
    alcada_rejeicao VARCHAR(25),
    usuario_aprovador_1 VARCHAR(25),
    usuario_aprovador_2 VARCHAR(25),
    nota_fiscal VARCHAR(25),
    status_nota_fiscal VARCHAR(25),
    desconto_total DECIMAL(10, 2),
    valor_total_pedido decimal(10, 2),
    valor_total_nota_fiscal decimal(10, 2),
    origem_pedido VARCHAR(25),
    codigo_incremento_prazo int,
    motivo_cancelamento VARCHAR(25),
    taxa_adf_utilizada decimal(10, 2),
    taxa_adf_escalonada decimal(10, 2),
    valor_pedido_minimo decimal(10, 2),
    indicador_entrega_alternativa VARCHAR(25),
    importado_pelo_hercules VARCHAR(25)
    
  );

CREATE TABLE
  IF NOT EXISTS `03_18_05` (
    unb int,
    descricao_unb VARCHAR(25),
    codigo_cliente int,
    nome_cliente VARCHAR(25),
    solicitacao_reposicao int,
    tipo_solicitacao VARCHAR(25),
    data_solicitacao date,
    hora time,
    status_solicitacao VARCHAR(25),
    data_acao date,
    usuario_acao VARCHAR(25),
    mapa_reposicao bigint,
    nota_fiscal_serie VARCHAR(25),
    status_nf VARCHAR(10),
    produto int,
    descricao_produto VARCHAR(25),
    quantidade int,
    um VARCHAR(10),
    valor_unitario decimal(10, 2),
    valor decimal(10, 2),
    pallet VARCHAR(25),
    montagem_pallet VARCHAR(10),
    justificativa VARCHAR(10),
    mapa_origem int,
    nf_origem VARCHAR(25),
    produto_origem int,
    descricao_produto_1 VARCHAR(25),
    quantidade_origem int,
    um_1 VARCHAR(10),
    veiculo int,
    placa VARCHAR(25),
    transportadora int,
    nome_transportadora VARCHAR(25),
    motorista int,
    nome_motorista VARCHAR(25),
    ajudante int,
    nome_ajudante_entrega VARCHAR(25),
    ajudante_1 int,
    nome_ajudante_entrega_1 VARCHAR(25),
    conferente_solicitacao_reposicao VARCHAR(25),
    nome_conferente_solicitacao_reposicao VARCHAR(25),
    conferente_carregamento VARCHAR(25),
    nome_conferente_carregamento VARCHAR(25),
    ajudante_carregamento VARCHAR(25),
    nome_ajudante_carregamento VARCHAR(25),
    ajudante_carregamento_1 VARCHAR(25),
    nome_ajudante_carregamento_1 VARCHAR(25),
    ajudante_carregamento_2 VARCHAR(25),
    nome_ajudante_carregamento_2 VARCHAR(25),
    ajudante_carregamento_3 VARCHAR(25),
    nome_ajudante_carregamento_3 VARCHAR(25),
    ajudante_carregamento_4 VARCHAR(25),
    nome_ajudante_carregamento_4 VARCHAR(25),
    ajudante_carregamento_5 VARCHAR(25),
    nome_ajudante_carregamento_5 VARCHAR(25),
    origem_blitz_carreg VARCHAR(25),
    nr_pedido_reposicao int,
    unb_cliente int,
    opcao_de_reposicao VARCHAR(25),
    status_check_reposicao VARCHAR(25),
    usuario_acao_check VARCHAR(25),
    data_acao_check date,
    sistema_origem VARCHAR(25),
    observacao VARCHAR(25),
    perfil_aprovacao_automatica VARCHAR(25),
    data_revisao date,
    usuario_revisao VARCHAR(25),
    tipo_cliente VARCHAR(25),
    setor_venda int,
    unnamed_69 VARCHAR(25)
    
  ) ROW_FORMAT=DYNAMIC;

CREATE TABLE
  IF NOT EXISTS `03_11_29` (
    data date,
    mapa int,
    placa VARCHAR(25),
    regiao_entrega VARCHAR(25),
    superv_rota int,
    nome_superv_rota VARCHAR(25),
    motorista int,
    nome_motorista VARCHAR(25),
    ajudante_1 VARCHAR(25),
    nome_ajudante_1 int,
    ajudante_2 VARCHAR(25),
    nome_ajudante_2 int,
    unnamed_12 VARCHAR(25)
    
  );

CREATE TABLE
  IF NOT EXISTS `03_08_05` (
    data DATE,
    transp int,
    entrega VARCHAR(20),
    carga_atual VARCHAR(20),
    frota VARCHAR(20),
    custo_spot DECIMAL(15, 2),
    regiao int,
    veiculo int,
    placa VARCHAR(10),
    mapa INT,
    capac INT,
    entregas INT,
    cx_carreg DECIMAL(10, 2),
    cx_entreg DECIMAL(10, 2),
    ocup DECIMAL(6, 2),
    cx_rota int,
    cx_as int,
    veicbm DECIMAL(6, 2),
    rshow int,
    entr_vol VARCHAR(20),
    hr_sai TIME,
    hr_entr TIME,
    km_sai INT,
    km_entr INT,
    km_prev DECIMAL(8, 2),
    tempo_prev TIME,
    vl_pto_mot DECIMAL(10, 6),
    vl_pto_ajd DECIMAL(10, 6),
    vl_eq_mot DECIMAL(10, 2),
    vl_eq_ajd DECIMAL(10, 2),
    cd_mot INT,
    cd_aju1 INT,
    cd_aju2 INT,
    km_desloc INT,
    km_laco INT,
    tmpo_desloc TIME,
    tmpo_laco TIME,
    tmpo_interno TIME,
    mot_nao_carr int,
    cx_carr_com DECIMAL(10, 2),
    capacidade_veiculo_kg DECIMAL(10, 2),
    peso_carga_kg DECIMAL(10, 2),
    classificacao_roadshow VARCHAR(20),
    classificacao_roads VARCHAR(20)
    
  );

CREATE TABLE
  IF NOT EXISTS base_rating (
    data_avaliacao date,
    avaliacao int,
    classificacao VARCHAR(25),
    cod_cdd bigint,
    motorista VARCHAR(25),
    cod_pdv int,
    nome_pdv VARCHAR(25),
    transportadora VARCHAR(25),
    mapa int,
    motivo VARCHAR(25),
    comentario VARCHAR(25),
    estado VARCHAR(25),
    cidade VARCHAR(25)
   
  );

CREATE TABLE
  IF NOT EXISTS expurgos (mapa INT primary key);

CREATE TABLE
  IF NOT EXISTS jornada_laboral (
    data date,
    funcionario VARCHAR(25),
    matricula int,
    e time,
    sa time,
    ra time,
    s time,
    trabalhadas time
    
  );

CREATE TABLE
  IF NOT EXISTS `03_01_47_01` (
    cod_puxada int,
    nome_filial VARCHAR(25),
    geografia VARCHAR(25),
    canal_de_marcacao VARCHAR(20),
    origem VARCHAR(20),
    gerente_vendas int,
    nome_gerente_vendas VARCHAR(25),
    area int,
    nome_area VARCHAR(25),
    setor int,
    nome_setor VARCHAR(25),
    vendedor int,
    nome_vendedor VARCHAR(25),
    cliente int,
    nome_cliente VARCHAR(25),
    categoria_cliente int,
    desc_categoria_cliente VARCHAR(25),
    tipo_movimento int,
    desc_tipo_movimento VARCHAR(25),
    operacao int,
    desc_operacao VARCHAR(25),
    transportadora int,
    nome_transportadora VARCHAR(25),
    nr_roadshow int,
    data DATE,
    pedido int,
    nota_fiscal bigint,
    serie int,
    tipo_marca int,
    desc_tipo_marca VARCHAR(25),
    embalagem int,
    desc_embalagem VARCHAR(25),
    cod_prod int,
    nome_prod VARCHAR(25),
    volume_marcacao DECIMAL(10, 3),
    volume_entrega DECIMAL(10, 3),
    motivo VARCHAR(25),
    submotivo_1 VARCHAR(25),
    submotivo_2 VARCHAR(25),
    codigo_marca int,
    descricao_marca VARCHAR(25),
    cod_municipio VARCHAR(20),
    nome_municipio VARCHAR(25),
    cod_rede VARCHAR(20),
    nome_rede VARCHAR(25),
    fora_de_rota VARCHAR(10),
    ajuste VARCHAR(10),
    idade_do_pedido INT,
    situacao VARCHAR(20),
    prioridade_road VARCHAR(20),
    prioridade_venda VARCHAR(20),
    hora_envio_roadshow DATETIME,
    hora_retorno_roadshow DATETIME,
    pedido_origem VARCHAR(25),
    cod_filial_origem VARCHAR(20),
    nome_filial_origem VARCHAR(25),
    mapa int,
    pedido_quebra_original VARCHAR(25),
    pedido_cliente VARCHAR(25),
    pedido_sistema_origem VARCHAR(25),
    data_entrega_nf DATE,
    entrega_real DATETIME,
    visita_otif VARCHAR(20),
    primeira_quebra VARCHAR(20),
    cliente_ponto_de_apoio VARCHAR(25),
    data_hora_envio_road_magali DATETIME,
    data_hora_retorno_road_magali DATETIME,
    codigo_condicao_de_pagamento VARCHAR(20),
    descricao_condicao_de_pagamento VARCHAR(25),
    quantidade INT,
    unid_venda VARCHAR(10)
    
  );

CREATE TABLE
  IF NOT EXISTS `03_02_24` (
    mapa bigint,
    data date,
    unb_nota VARCHAR(25),
    nota bigint,
    serie int,
    unb_cliente VARCHAR(25),
    cod_cliente int,
    nome_cliente VARCHAR(25),
    telefone VARCHAR(25),
    area int,
    setor int,
    placa VARCHAR(25),
    valor decimal(10, 2),
    volume decimal(10, 2),
    data_devol DATE,
    cod_motivo int,
    desc_motivo VARCHAR(25),
    orig_pedido VARCHAR(25),
    usuario VARCHAR(25),
    hora time
  );

CREATE TABLE
  IF NOT EXISTS `03_02_37_operacao_veiculo_mapa` (
    empresa int,
    filial int,
    operacao int,
    codigo_vei int,
    mapa int,
    dt_operacao date,
    emissao date,
    nota bigint,
    serie int,
    status VARCHAR(10),
    mot_cancelamento int,
    transf_multi_cdd VARCHAR(25),
    cliente int,
    nome VARCHAR(25),
    indicador_ca_prazo VARCHAR(25),
    produto int,
    unidade VARCHAR(10),
    descricao VARCHAR(25),
    combo_vendas VARCHAR(25),
    qtde int,
    valor decimal(10, 2),
    icms decimal(10, 2),
    icms_st decimal(10, 2),
    adic_finan decimal(10, 2),
    desconto decimal(10, 2),
    total decimal(10, 2),
    mapa_2 int,
    nr_tit_bco int,
    nr_pedido int,
    ipi decimal(10, 2),
    frete VARCHAR(25),
    adic_escal VARCHAR(25),
    trib_pis_pauta VARCHAR(25),
    trib_pis_aliquota VARCHAR(25),
    trib_cofins_pauta VARCHAR(25),
    trib_cofins_aliquota VARCHAR(25),
    nf_referencia VARCHAR(25),
    serie_nf_referencia VARCHAR(25),
    data_nf_referencia VARCHAR(25),
    status_nf_e VARCHAR(25),
    motivo_rejeicao_denegacao int,
    descricao_motivo VARCHAR(25),
    data_contingencia VARCHAR(25),
    hora_contingencia VARCHAR(25),
    nr_protocolo bigint,
    chave_de_acesso_nf_e VARCHAR(25),
    indicador_nf_e VARCHAR(10),
    hora_envio time,
    hora_retorno time,
    indicador_de_caneta VARCHAR(10),
    indicador_fora_rota_entrega VARCHAR(10),
    id_mensageria VARCHAR(10),
    status_sefaz_hb_nfex int,
    data_retorno_hb_nfex date,
    hora_retorno_hb_nfex time,
    data_envio_2v VARCHAR(25),
    estoque_atualizado VARCHAR(10),
    dt_emissao_fiscal date,
    nota_fiscal_exportada_para_promax_central VARCHAR(25),
    prazo VARCHAR(25),
    nf_retorno_vasilhame VARCHAR(25),
    nf_venda_ag_produto_material VARCHAR(25),
    nf_retorno_remessa_puxada_ag VARCHAR(25),
    nf_recolha_comodato VARCHAR(25),
    nf_troca_realizada VARCHAR(25),
    taxa_de_entrega VARCHAR(25),
    origem_do_pedido VARCHAR(25),
    vl_desconto_algoritmo VARCHAR(25),
    meta_algoritmo VARCHAR(25),
    desc_disponivel_padrao VARCHAR(25),
    desc_disponivel_acao VARCHAR(25),
    vl_desconto_algoritmo_aut VARCHAR(25),
    codigo_acao_desconto_alg_fix VARCHAR(25),
    valor_ttv_planejado VARCHAR(25),
    valor_sugerido VARCHAR(25),
    cod_setor_atendimento VARCHAR(25),
    tipo_setor_atendimento VARCHAR(25),
    setor int,
    codigo_da_escalonada_do_pedido VARCHAR(25),
    tipo_escalonada_do_pedido VARCHAR(25),
    faixa_da_escalonada_do_pedido VARCHAR(25),
    indicador_de_preco_pontual VARCHAR(25),
    indicador_de_preco_cheio VARCHAR(25),
    ttv_da_escalonada_do_pedido VARCHAR(25),
    indicador_de_unidade VARCHAR(25),
    data_captura_pedido VARCHAR(25),
    nf_regerada VARCHAR(25),
    serie_nf_regerada VARCHAR(25),
    indicador_cancelamento VARCHAR(25),
    red_icms_proprio VARCHAR(25),
    red_fecop_proprio VARCHAR(25),
    red_icms_st VARCHAR(25),
    red_fecop_st VARCHAR(25),
    cod_situacao_tributaria VARCHAR(25),
    campo_extra VARCHAR(10)
  )ROW_FORMAT=DYNAMIC;

CREATE TABLE
  IF NOT EXISTS `03_02_37_tipo_movto` (
    empresa int,
    filial int,
    tipo_movto int,
    dt_operacao date,
    emissao date,
    nota bigint,
    serie int,
    status VARCHAR(25),
    mot_cancelamento int,
    transf_multi_cdd VARCHAR(25),
    cliente int,
    nome VARCHAR(25),
    indicador_ca_prazo VARCHAR(25),
    produto int,
    unidade VARCHAR(10),
    descricao VARCHAR(25),
    combo_vendas VARCHAR(25),
    qtde int,
    valor decimal(10, 2),
    icms decimal(10, 2),
    icms_st decimal(10, 2),
    adic_finan decimal(10, 2),
    desconto decimal(10, 2),
    total decimal(10, 2),
    mapa int,
    nr_tit_bco int,
    nr_pedido VARCHAR(25),
    ipi VARCHAR(25),
    frete VARCHAR(25),
    adic_escal VARCHAR(25),
    trib_pis_pauta VARCHAR(25),
    trib_pis_aliquota VARCHAR(25),
    trib_cofins_pauta VARCHAR(25),
    trib_cofins_aliquota VARCHAR(25),
    nf_referencia VARCHAR(25),
    serie_nf_referencia VARCHAR(25),
    data_nf_referencia VARCHAR(25),
    status_nf_e VARCHAR(25),
    motivo_rejeicao_denegacao VARCHAR(25),
    descricao_motivo VARCHAR(25),
    data_contingencia VARCHAR(25),
    hora_contingencia VARCHAR(25),
    nr_protocolo VARCHAR(25),
    chave_de_acesso_nf_e VARCHAR(25),
    indicador_nf_e VARCHAR(25),
    hora_envio VARCHAR(25),
    hora_retorno VARCHAR(25),
    indicador_de_caneta VARCHAR(25),
    indicador_fora_rota_entrega VARCHAR(25),
    id_mensageria VARCHAR(25),
    status_sefaz_hb_nfex VARCHAR(25),
    data_retorno_hb_nfex VARCHAR(25),
    hora_retorno_hb_nfex VARCHAR(25),
    data_envio_2v VARCHAR(25),
    estoque_atualizado VARCHAR(25),
    dt_emissao_fiscal VARCHAR(25),
    nota_fiscal_exportada_para_promax_central VARCHAR(25),
    prazo VARCHAR(25),
    nf_retorno_vasilhame VARCHAR(25),
    nf_venda_ag_produto_material VARCHAR(25),
    nf_retorno_remessa_puxada_ag VARCHAR(25),
    nf_recolha_comodato VARCHAR(25),
    nf_troca_realizada VARCHAR(25),
    taxa_de_entrega VARCHAR(25),
    origem_do_pedido VARCHAR(25),
    vl_desconto_algoritmo VARCHAR(25),
    meta_algoritmo VARCHAR(25),
    desc_disponivel_padrao VARCHAR(25),
    desc_disponivel_acao VARCHAR(25),
    vl_desconto_algoritmo_aut VARCHAR(25),
    codigo_acao_desconto_alg_fix VARCHAR(25),
    valor_ttv_planejado VARCHAR(25),
    valor_sugerido VARCHAR(25),
    cod_setor_atendimento VARCHAR(25),
    tipo_setor_atendimento VARCHAR(25),
    setor int,
    codigo_escalonada_pedido VARCHAR(25),
    tipo_escalonada_pedido VARCHAR(25),
    faixa_escalonada_pedido VARCHAR(25),
    indicador_preco_pontual VARCHAR(25),
    indicador_preco_cheio VARCHAR(25),
    ttv_escalonada_pedido VARCHAR(25),
    indicador_unidade VARCHAR(25),
    data_captura_pedido VARCHAR(25),
    nf_regerada VARCHAR(25),
    serie_nf_regerada VARCHAR(25),
    indicador_cancelamento VARCHAR(25),
    red_icms_proprio VARCHAR(25),
    red_fecop_proprio VARCHAR(25),
    red_icms_st VARCHAR(25),
    red_fecop_st VARCHAR(25),
    cod_situacao_tributaria VARCHAR(25)
  )ROW_FORMAT=DYNAMIC;

CREATE TABLE
  IF NOT EXISTS `03_05_30_cliente` (
    cod_cliente int,
    descricao VARCHAR(25),
    data date,
    mapa int,
    veiculo int,
    placa VARCHAR(25),
    motorista int,
    cod_produto INT,
    descricao_1 VARCHAR(25),
    cod_cliente_1 int,
    descricao_2 VARCHAR(25),
    peso int,
    perc_ocup int,
    volume decimal(10, 4),
    perc_ocup_1 int,
    vol_agendado VARCHAR(25),
    entregas int,
    pedidos int,
    d_size_agend decimal(10, 2),
    d_size_total decimal(10, 2),
    unnamed_20 VARCHAR(25)
  );

CREATE TABLE
  IF NOT EXISTS `03_05_30_cod_ajudante` (
    cod_ajudante int,
    descricao VARCHAR(25),
    data date,
    mapa int,
    veiculo int,
    placa VARCHAR(25),
    motorista int,
    cod_produto INT,
    descricao_1 VARCHAR(25),
    cod_cliente_1 int,
    descricao_2 VARCHAR(25),
    peso int,
    perc_ocup int,
    volume decimal(10, 4),
    perc_ocup_1 int,
    vol_agendado VARCHAR(25),
    entregas int,
    pedidos int,
    d_size_agend decimal(10, 2),
    d_size_total decimal(10, 2),
    unnamed_20 VARCHAR(25)
  );

CREATE TABLE
  IF NOT EXISTS `03_05_30_cod_motorista` (
    cod_motorista int,
    descricao VARCHAR(25),
    data date,
    mapa int,
    veiculo int,
    placa VARCHAR(25),
    motorista VARCHAR(25),
    cod_produto VARCHAR(25),
    descricao_1 VARCHAR(25),
    cod_cliente_1 int,
    descricao_2 VARCHAR(25),
    peso int,
    perc_ocup int,
    volume decimal(10, 4),
    perc_ocup_1 int,
    vol_agendado VARCHAR(25),
    entregas int,
    pedidos int,
    d_size_agend decimal(10, 2),
    d_size_total decimal(10, 2),
    unnamed_20 VARCHAR(25)
  );

CREATE TABLE
  IF NOT EXISTS `03_05_30_mapa` (
    mapa int,
    data date,
    mapa_1 int,
    veiculo int,
    placa VARCHAR(25),
    motorista int,
    cod_produto INT,
    descricao VARCHAR(25),
    cod_cliente_1 int,
    descricao_1 VARCHAR(25),
    peso int,
    perc_ocup int,
    volume decimal(10, 4),
    perc_ocup_1 int,
    vol_agendado VARCHAR(25),
    entregas int,
    pedidos int,
    d_size_agend decimal(10, 2),
    d_size_total decimal(10, 2)
  );

CREATE TABLE
  IF NOT EXISTS base_bees_deliver_dia (
    tour_display_id bigint,
    tour_date date,
    distribution_center_id int,
    driver_name VARCHAR(25),
    poc_external_id int,
    status VARCHAR(25),
    trip_start_timestamp VARCHAR(25),
    trip_end_timestamp VARCHAR(25),
    visit_order int,
    within_radius VARCHAR(25),
    actual_delivery_time int,
    arrived_at VARCHAR(25),
    finished_at VARCHAR(25),
    last_reason_waiting_modulation VARCHAR(25),
    last_reason_rescheduled VARCHAR(25),
    total_delivered_vol VARCHAR(25),
    total_refused_vol VARCHAR(25),
    foxtrot_adherence VARCHAR(25),
    estimated_delivery_time int,
    volume_hectoliters_sum VARCHAR(25),
    bees_poc_id bigint,
    bees_tour_id VARCHAR(25),
    bees_trip_id VARCHAR(25),
    bees_created_date VARCHAR(25),
    bees_last_reason_id_waiting_modulation VARCHAR(25),
    bees_last_reason_id_waiting_rescheduled VARCHAR(25)
  );

CREATE TABLE
  IF NOT EXISTS `01_20_11` (
    grupo_de_perfil int,
    cod_setor int,
    descricao_setor VARCHAR(25),
    codigo_cliente bigint,
    razao_social VARCHAR(25),
    bairro VARCHAR(25),
    ordem VARCHAR(25),
    status_do_cliente VARCHAR(10),
    nome_fantasia VARCHAR(25),
    frequencia_visita VARCHAR(25),
    periodicidade VARCHAR(25),
    proxima_visita date,
    visita_original date,
    inicio_visita date,
    cnpj VARCHAR(25),
    inscricao_estadual VARCHAR(25),
    cod_estabelecimento bigint,
    nome_estabelecimento VARCHAR(25),
    cod_pagto int,
    descricao_pagto VARCHAR(25),
    serasa VARCHAR(10),
    observacao VARCHAR(25),
    contato VARCHAR(25),
    cnpj_1 VARCHAR(25),
    contato_1 VARCHAR(25),
    cnpj_2 VARCHAR(25),
    ordem_por_historico VARCHAR(25),
    dias_entrega VARCHAR(25),
    el_dorado VARCHAR(10),
    endereco VARCHAR(25),
    cidade VARCHAR(25),
    cod_segmento int,
    segmento VARCHAR(25)
  );

CREATE TABLE
  IF NOT EXISTS `01_11` (
    codigo bigint,
    descricao VARCHAR(25),
    pgv int,
    empresa VARCHAR(10),
    tipo_marca VARCHAR(25),
    linha_marca int,
    embalagem VARCHAR(25),
    marca int,
    vasilhame int,
    garrrafeira int,
    icms int,
    tipo_roadshow VARCHAR(10),
    peso_bruto_kg decimal(10, 2),
    fator int,
    fator_hecto float,
    fator_hecto_comercial float,
    ind_palmtop VARCHAR(10),
    grupo int,
    grupo_remuneracao int,
    ean bigint,
    tab_icms int,
    caixas_pallet int,
    nr_fator_conversao decimal(10, 2),
    lastro VARCHAR(25),
    fam_embalagem_siv int,
    pauta_pis_litro int,
    pauta_cofins_litro int,
    caixas_pallet_1 int,
    capacidade_1 int,
    fat_ajust_1 float,
    caixas_pallet_2 int,
    capacidade_2 int,
    fat_ajust_2 float,
    caixas_pallet_3 int,
    capacidade_3 int,
    fat_ajust_3 float,
    ordem_de_carga int,
    estoque_minimo_puxada int,
    codigo_produto_sap int,
    vasilhame_ficticio VARCHAR(25),
    ncm bigint,
    apura_royalties VARCHAR(10),
    tipo_produto_royalties int,
    cest bigint,
    ean_trib bigint,
    codigo_unitario int,
    descricao_unitaria VARCHAR(25),
    subtipo int
  );

CREATE TABLE
  IF NOT EXISTS veiculos (
    frota INT,
    placa VARCHAR(20),
    modelo VARCHAR(25),
    tipo VARCHAR(10)
  );

CREATE TABLE
  IF NOT EXISTS motoristas (
    cod_filial VARCHAR(25),
    descricao_filial VARCHAR(25),
    cod_motorista VARCHAR(25),
    nome_motorista VARCHAR(25),
    status VARCHAR(25),
    cod_supervisor_rota VARCHAR(25),
    cpf VARCHAR(25),
    data_admissao VARCHAR(25),
    data_inativacao VARCHAR(25),
    j_alternativa VARCHAR(25),
    descricao_j_alternativa VARCHAR(25),
    rota_gradativa VARCHAR(25),
    celular_corporativo VARCHAR(25),
    cod_cluster VARCHAR(25),
    cluster VARCHAR(25)
  );

CREATE TABLE
  IF NOT EXISTS ajudante (
    cod INT,
    nome VARCHAR(100),
    cpf VARCHAR(20),
    status VARCHAR(25)
  );

-- Tabelas da base 'rotinas'
CREATE TABLE
  IF NOT EXISTS log_03_11_42 (
    nome_arquivo VARCHAR(100) PRIMARY KEY,
    data_upload DATETIME,
    hash_arquivo CHAR(64),
    sucesso BOOLEAN,
    mensagem_erro TEXT
  );

CREATE TABLE
  IF NOT EXISTS log_03_11_40 (
    nome_arquivo VARCHAR(100) PRIMARY KEY,
    data_upload DATETIME,
    hash_arquivo CHAR(64),
    sucesso BOOLEAN,
    mensagem_erro TEXT
  );

CREATE TABLE
  IF NOT EXISTS log_relatorio_separacao_wms (
    nome_arquivo VARCHAR(100) PRIMARY KEY,
    data_upload DATETIME,
    hash_arquivo CHAR(64),
    sucesso BOOLEAN,
    mensagem_erro TEXT
  );

CREATE TABLE
  IF NOT EXISTS log_03_01_46_06 (
    nome_arquivo VARCHAR(100) PRIMARY KEY,
    data_upload DATETIME,
    hash_arquivo CHAR(64),
    sucesso BOOLEAN,
    mensagem_erro TEXT
  );

CREATE TABLE
  IF NOT EXISTS log_03_18_05 (
    nome_arquivo VARCHAR(100) PRIMARY KEY,
    data_upload DATETIME,
    hash_arquivo CHAR(64),
    sucesso BOOLEAN,
    mensagem_erro TEXT
  );

CREATE TABLE
  IF NOT EXISTS log_03_11_29 (
    nome_arquivo VARCHAR(100) PRIMARY KEY,
    data_upload DATETIME,
    hash_arquivo CHAR(64),
    sucesso BOOLEAN,
    mensagem_erro TEXT
  );

CREATE TABLE
  IF NOT EXISTS log_03_08_05 (
    nome_arquivo VARCHAR(100) PRIMARY KEY,
    data_upload DATETIME,
    hash_arquivo CHAR(64),
    sucesso BOOLEAN,
    mensagem_erro TEXT
  );

CREATE TABLE
  IF NOT EXISTS log_base_rating (
    nome_arquivo VARCHAR(100) PRIMARY KEY,
    data_upload DATETIME,
    hash_arquivo CHAR(64),
    sucesso BOOLEAN,
    mensagem_erro TEXT
  );

CREATE TABLE
  IF NOT EXISTS log_expurgos (
    nome_arquivo VARCHAR(100) PRIMARY KEY,
    data_upload DATETIME,
    hash_arquivo CHAR(64),
    sucesso BOOLEAN,
    mensagem_erro TEXT
  );

CREATE TABLE
  IF NOT EXISTS log_jornada_laboral (
    nome_arquivo VARCHAR(100) PRIMARY KEY,
    data_upload DATETIME,
    hash_arquivo CHAR(64),
    sucesso BOOLEAN,
    mensagem_erro TEXT
  );

CREATE TABLE
  IF NOT EXISTS log_03_01_47_01 (
    nome_arquivo VARCHAR(100) PRIMARY KEY,
    data_upload DATETIME,
    hash_arquivo CHAR(64),
    sucesso BOOLEAN,
    mensagem_erro TEXT
  );

CREATE TABLE
  IF NOT EXISTS log_03_02_24 (
    nome_arquivo VARCHAR(100) PRIMARY KEY,
    data_upload DATETIME,
    hash_arquivo CHAR(64),
    sucesso BOOLEAN,
    mensagem_erro TEXT
  );

-- Tabelas da base '030237'
CREATE TABLE
  IF NOT EXISTS log_03_02_37_operacao_veiculo_mapa (
    nome_arquivo VARCHAR(100) PRIMARY KEY,
    data_upload DATETIME,
    hash_arquivo CHAR(64),
    sucesso BOOLEAN,
    mensagem_erro TEXT
  );

CREATE TABLE
  IF NOT EXISTS log_03_02_37_tipo_movto (
    nome_arquivo VARCHAR(100) PRIMARY KEY,
    data_upload DATETIME,
    hash_arquivo CHAR(64),
    sucesso BOOLEAN,
    mensagem_erro TEXT
  );

-- Tabelas da base '030530'
CREATE TABLE
  IF NOT EXISTS log_03_05_30_cliente (
    nome_arquivo VARCHAR(100) PRIMARY KEY,
    data_upload DATETIME,
    hash_arquivo CHAR(64),
    sucesso BOOLEAN,
    mensagem_erro TEXT
  );

CREATE TABLE
  IF NOT EXISTS log_03_05_30_cod_ajudante (
    nome_arquivo VARCHAR(100) PRIMARY KEY,
    data_upload DATETIME,
    hash_arquivo CHAR(64),
    sucesso BOOLEAN,
    mensagem_erro TEXT
  );

CREATE TABLE
  IF NOT EXISTS log_03_05_30_cod_motorista (
    nome_arquivo VARCHAR(100) PRIMARY KEY,
    data_upload DATETIME,
    hash_arquivo CHAR(64),
    sucesso BOOLEAN,
    mensagem_erro TEXT
  );

CREATE TABLE
  IF NOT EXISTS log_03_05_30_mapa (
    nome_arquivo VARCHAR(100) PRIMARY KEY,
    data_upload DATETIME,
    hash_arquivo CHAR(64),
    sucesso BOOLEAN,
    mensagem_erro TEXT
  );

-- Tabela da base 'bees_deliver'
CREATE TABLE
  IF NOT EXISTS log_base_bees_deliver_dia (
    nome_arquivo VARCHAR(100) PRIMARY KEY,
    data_upload DATETIME,
    hash_arquivo CHAR(64),
    sucesso BOOLEAN,
    mensagem_erro TEXT
  );

-- Tabelas da base 'cadastros'
CREATE TABLE
  IF NOT EXISTS log_01_20_11 (
    nome_arquivo VARCHAR(100) PRIMARY KEY,
    data_upload DATETIME,
    hash_arquivo CHAR(64),
    sucesso BOOLEAN,
    mensagem_erro TEXT
  );

CREATE TABLE
  IF NOT EXISTS log_01_11 (
    nome_arquivo VARCHAR(100) PRIMARY KEY,
    data_upload DATETIME,
    hash_arquivo CHAR(64),
    sucesso BOOLEAN,
    mensagem_erro TEXT
  );

-- Tabelas auxiliares
CREATE TABLE
  IF NOT EXISTS log_veiculos (
    nome_arquivo VARCHAR(100) PRIMARY KEY,
    data_upload DATETIME,
    hash_arquivo CHAR(64),
    sucesso BOOLEAN,
    mensagem_erro TEXT
  );

CREATE TABLE
  IF NOT EXISTS log_motoristas (
    nome_arquivo VARCHAR(100) PRIMARY KEY,
    data_upload DATETIME,
    hash_arquivo CHAR(64),
    sucesso BOOLEAN,
    mensagem_erro TEXT
  );

CREATE TABLE
  IF NOT EXISTS log_ajudante (
    nome_arquivo VARCHAR(100) PRIMARY KEY,
    data_upload DATETIME,
    hash_arquivo CHAR(64),
    sucesso BOOLEAN,
    mensagem_erro TEXT
  );