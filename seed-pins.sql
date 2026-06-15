-- SEED PINs (idempotente): garante pgcrypto + pin_hash dos colaboradores.
-- So preenche onde pin_hash IS NULL (nao sobrescreve PIN ja trocado).
CREATE EXTENSION IF NOT EXISTS pgcrypto;
SET search_path TO khardela, public;
ALTER TABLE rbac_contacts ADD COLUMN IF NOT EXISTS pin_hash TEXT;
ALTER TABLE rbac_contacts ADD COLUMN IF NOT EXISTS pin_changed_at TIMESTAMPTZ;
ALTER TABLE rbac_contacts ADD COLUMN IF NOT EXISTS pin_must_change BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE rbac_contacts SET pin_hash=crypt('248165', gen_salt('bf',8)), pin_changed_at=NOW() WHERE tenant_id='khardela:premiumpizzas:sjrp' AND LOWER(apelido_login)='tassiano' AND pin_hash IS NULL;
UPDATE rbac_contacts SET pin_hash=crypt('730942', gen_salt('bf',8)), pin_changed_at=NOW() WHERE tenant_id='khardela:premiumpizzas:sjrp' AND LOWER(apelido_login)='eva' AND pin_hash IS NULL;
UPDATE rbac_contacts SET pin_hash=crypt('156307', gen_salt('bf',8)), pin_changed_at=NOW() WHERE tenant_id='khardela:premiumpizzas:sjrp' AND LOWER(apelido_login)='thiago' AND pin_hash IS NULL;
UPDATE rbac_contacts SET pin_hash=crypt('482519', gen_salt('bf',8)), pin_changed_at=NOW() WHERE tenant_id='khardela:premiumpizzas:sjrp' AND LOWER(apelido_login)='sophia' AND pin_hash IS NULL;
UPDATE rbac_contacts SET pin_hash=crypt('691204', gen_salt('bf',8)), pin_changed_at=NOW() WHERE tenant_id='khardela:premiumpizzas:sjrp' AND LOWER(apelido_login)='dany' AND pin_hash IS NULL;
UPDATE rbac_contacts SET pin_hash=crypt('357816', gen_salt('bf',8)), pin_changed_at=NOW() WHERE tenant_id='khardela:premiumpizzas:sjrp' AND LOWER(apelido_login)='cristina' AND pin_hash IS NULL;
UPDATE rbac_contacts SET pin_hash=crypt('925148', gen_salt('bf',8)), pin_changed_at=NOW() WHERE tenant_id='khardela:premiumpizzas:sjrp' AND LOWER(apelido_login)='evandro' AND pin_hash IS NULL;
UPDATE rbac_contacts SET pin_hash=crypt('408273', gen_salt('bf',8)), pin_changed_at=NOW() WHERE tenant_id='khardela:premiumpizzas:sjrp' AND LOWER(apelido_login)='maria' AND pin_hash IS NULL;
UPDATE rbac_contacts SET pin_hash=crypt('561039', gen_salt('bf',8)), pin_changed_at=NOW() WHERE tenant_id='khardela:premiumpizzas:sjrp' AND LOWER(apelido_login)='geane' AND pin_hash IS NULL;

-- Perfis (idempotente): Thiago = Chefe de Cozinha + Gestor; Eva = Gestora.
UPDATE rbac_contacts SET perfis_adicionais = array_append(COALESCE(perfis_adicionais,'{}'),'GESTOR')
  WHERE tenant_id='khardela:premiumpizzas:sjrp' AND LOWER(apelido_login)='thiago' AND NOT ('GESTOR' = ANY(COALESCE(perfis_adicionais,'{}')));
UPDATE rbac_contacts SET perfil_principal='GESTOR'
  WHERE tenant_id='khardela:premiumpizzas:sjrp' AND LOWER(apelido_login)='eva' AND perfil_principal <> 'GESTOR';

-- Telefones autorizados (com DDI 55) — usados pela Jessica p/ autorizar gestor.
UPDATE rbac_contacts SET phone='5534992772679' WHERE tenant_id='khardela:premiumpizzas:sjrp' AND LOWER(apelido_login)='thiago' AND phone<>'5534992772679';
UPDATE rbac_contacts SET phone='5534996891002' WHERE tenant_id='khardela:premiumpizzas:sjrp' AND LOWER(apelido_login)='tassiano' AND phone<>'5534996891002';
UPDATE rbac_contacts SET phone='5534997701003' WHERE tenant_id='khardela:premiumpizzas:sjrp' AND LOWER(apelido_login)='eva' AND phone<>'5534997701003';
UPDATE rbac_contacts SET phone='5517981643339' WHERE tenant_id='khardela:premiumpizzas:sjrp' AND LOWER(apelido_login)='sophia' AND phone<>'5517981643339';

-- Colaboradores que já usam o PIN não são forçados a trocar (evita atrapalhar a contagem).
UPDATE rbac_contacts SET pin_must_change=FALSE
  WHERE tenant_id='khardela:premiumpizzas:sjrp' AND LOWER(apelido_login) IN ('dany','cristina','evandro','maria','geane') AND pin_must_change IS NOT FALSE;
