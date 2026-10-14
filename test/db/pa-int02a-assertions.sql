-- Ejecutar después de pa-int02a-fixture.sql con ON_ERROR_STOP=1.
DO $$ DECLARE r RECORD; v_antes JSONB; v_rechazado BOOLEAN; BEGIN
  UPDATE public.usuario SET revision_autoridad=17;
  IF (SELECT organizacion FROM public.usuario WHERE id=2) IS DISTINCT FROM repeat('L',180) THEN
    RAISE EXCEPTION 'La migración truncó texto legado'; END IF;
  FOR r IN SELECT id,auth_id,rol,activo,revision_autoridad FROM public.usuario LOOP
    PERFORM public.pa_perfil_actualizar(r.id,r.auth_id,true,'Nombre '||r.auth_id,false,null,false,null,null);
    IF EXISTS(SELECT 1 FROM public.usuario u WHERE u.id=r.id AND
      (u.rol IS DISTINCT FROM r.rol OR u.activo IS DISTINCT FROM r.activo OR u.revision_autoridad IS DISTINCT FROM r.revision_autoridad)) THEN
      RAISE EXCEPTION 'Perfil cambió autoridad para %',r.rol; END IF;
  END LOOP;
  PERFORM public.pa_perfil_actualizar(3,'vol',false,null,false,null,true,9007199254740993,null);
  IF public.pa_perfil_leer(3,'vol')->'afiliacion'->>'organizacion_id' IS DISTINCT FROM '9007199254740993' THEN
    RAISE EXCEPTION 'BIGINT perdió precisión'; END IF;
  UPDATE public.organizacion SET nombre='Bosque Vivo Renombrado',activo=false WHERE id=9007199254740993;
  PERFORM public.pa_perfil_actualizar(3,'vol',false,null,true,'Apellido',false,null,null);
  IF public.pa_perfil_leer(3,'vol')->'afiliacion'->>'nombre' IS DISTINCT FROM 'Bosque Vivo Renombrado' THEN
    RAISE EXCEPTION 'No se conservó vínculo inactivo con nombre vigente'; END IF;
  v_antes:=public.pa_perfil_leer(3,'vol');
  FOR r IN SELECT unnest(ARRAY[2::BIGINT,999::BIGINT,9007199254740993::BIGINT]) AS id LOOP
    v_rechazado:=false;
    BEGIN
      PERFORM public.pa_perfil_actualizar(3,'vol',true,'No debe guardarse',false,null,true,r.id,null);
    EXCEPTION WHEN SQLSTATE 'P0001' THEN
      IF SQLERRM <> 'ORGANIZACION_NO_SELECCIONABLE' THEN RAISE; END IF;
      v_rechazado:=true;
    END;
    IF NOT v_rechazado OR public.pa_perfil_leer(3,'vol') IS DISTINCT FROM v_antes THEN
      RAISE EXCEPTION 'Selección inválida aceptada o actualización parcial para %',r.id; END IF;
  END LOOP;
  PERFORM public.pa_perfil_actualizar(3,'vol',false,null,false,null,true,null,'Otra entidad');
  IF public.pa_perfil_leer(3,'vol')->'afiliacion'->>'tipo' IS DISTINCT FROM 'OTRA' OR
     (SELECT organizacion_id FROM public.usuario WHERE id=3) IS NOT NULL THEN
    RAISE EXCEPTION 'Otra no limpió referencia'; END IF;
  PERFORM public.pa_perfil_actualizar(3,'vol',false,null,false,null,true,null,null);
  IF public.pa_perfil_leer(3,'vol')->'afiliacion' IS DISTINCT FROM 'null'::JSONB THEN
    RAISE EXCEPTION 'Ausencia no limpia afiliación'; END IF;
  PERFORM public.pa_perfil_actualizar(3,'vol',false,null,false,null,true,12,null);
  IF length(public.pa_perfil_leer(3,'vol')->'afiliacion'->>'nombre')<>2000 THEN
    RAISE EXCEPTION 'Nombre de catálogo truncado'; END IF;
  v_antes:=public.pa_perfil_leer(3,'vol');
  v_rechazado:=false;
  BEGIN
    PERFORM public.pa_perfil_actualizar(3,'vol',true,'Cambio parcial prohibido',false,null,true,null,'Otra',
      '{"doc_identidad":"DOCUMENTO_OCUPADO"}'::JSONB);
  EXCEPTION WHEN unique_violation THEN v_rechazado:=true;
  END;
  IF NOT v_rechazado OR public.pa_perfil_leer(3,'vol') IS DISTINCT FROM v_antes THEN
    RAISE EXCEPTION 'Conflicto histórico dejó perfil parcialmente actualizado'; END IF;
END $$;

DO $$ BEGIN
  INSERT INTO public.usuario(id,auth_id,username,nombre) VALUES(4,'new','new','Nuevo');
  IF (SELECT rol FROM public.usuario WHERE id=4) <> 'VOLUNTARIO' OR
     (SELECT count(*) FROM public.usuario WHERE activo AND revision_autoridad=17) <> 4 OR
     (SELECT revision_autoridad FROM public.usuario WHERE id=4) <> 0 THEN
    RAISE EXCEPTION 'Default o autoridad incorrectos'; END IF;
  BEGIN UPDATE public.usuario SET organizacion_id=2,organizacion='Ambas' WHERE id=4;
    RAISE EXCEPTION 'CHECK no rechazó doble afiliación';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN UPDATE public.usuario SET organizacion_id=999,organizacion=NULL WHERE id=4;
    RAISE EXCEPTION 'FK no rechazó ID inexistente';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN INSERT INTO public.usuario(id,auth_id) VALUES(5,'admin');
    RAISE EXCEPTION 'auth_id duplicado permitido';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN INSERT INTO public.usuario(id,auth_id) VALUES(5,NULL);
    RAISE EXCEPTION 'auth_id NULL permitido';
  EXCEPTION WHEN not_null_violation THEN NULL; END;
  BEGIN INSERT INTO public.usuario(id,auth_id) VALUES(5,'  ');
    RAISE EXCEPTION 'auth_id vacío permitido';
  EXCEPTION WHEN check_violation THEN NULL; END;
  IF (SELECT count(*) FROM public.pa_organizaciones_seleccionables(3,'vol','Bosque',NULL,20))<>1 THEN
    RAISE EXCEPTION 'Selector no filtra inactivas'; END IF;
  IF (SELECT array_agg(organizacion_id) FROM public.pa_organizaciones_seleccionables(3,'vol','Árbol',NULL,20)) IS DISTINCT FROM ARRAY['13','14'] THEN
    RAISE EXCEPTION 'Búsqueda/orden NFC incorrectos'; END IF;
  IF (SELECT array_agg(organizacion_id) FROM public.pa_organizaciones_seleccionables(3,'vol','Árbol',13,20)) IS DISTINCT FROM ARRAY['14'] THEN
    RAISE EXCEPTION 'Paginación por nombre/ID incorrecta'; END IF;
END $$;

SET ROLE service_role;
DO $$ BEGIN
  IF public.pa_actor_verificar('admin')->>'usuario_id' IS DISTINCT FROM '9007199254740995' THEN
    RAISE EXCEPTION 'Actor BIGINT o grants service_role incorrectos'; END IF;
  PERFORM public.pa_perfil_actualizar(3,'vol',true,'Voluntario verificado',false,null,false,null,null);
  PERFORM public.pa_perfil_foto_actualizar(3,'vol','https://fixture.invalid/foto.png');
END $$;
RESET ROLE;
SET ROLE authenticated;
DO $$ BEGIN
  BEGIN PERFORM public.pa_perfil_actualizar(3,'vol',true,'Ataque',false,null,false,null,null);
    RAISE EXCEPTION 'RPC pública abierta'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO public.usuario(id,auth_id,rol) VALUES(99,'ataque','ADMIN');
    RAISE EXCEPTION 'INSERT público de autoridad abierto'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN UPDATE public.usuario SET rol='ADMIN';
    RAISE EXCEPTION 'UPDATE público de autoridad abierto'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET ROLE anon;
DO $$ BEGIN
  BEGIN PERFORM public.pa_actor_verificar('admin');
    RAISE EXCEPTION 'Actor RPC público abierto'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO public.usuario(id,auth_id,rol) VALUES(99,'ataque','ADMIN');
    RAISE EXCEPTION 'INSERT anon abierto'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
