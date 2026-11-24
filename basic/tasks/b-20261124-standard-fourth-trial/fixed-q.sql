SELECT
	scheme_id ,model_id,model_sn,GROUP_CONCAT(remark) remark,tag,parent_tag,tag_name,parent_tag_name,name,model_unit,picture,spec,color,texture,model_remark,sum(price) price,sum(qty) qty,sum(real_qty) real_qty,pcs_qty,sum(original_price) original_price,unit_price ,sort_index,parent_sort_index,
	sum(sku_price) as sku_price,sum(artificial_price) as artificial_price,sum(sku_original_price) as sku_original_price,sum(artificial_original_price) as artificial_original_price
FROM
	(
	SELECT
		s.scheme_id,
		( CASE WHEN t1.name = '单品' THEN t3.id ELSE s.model_id END ) AS model_id,
		( CASE WHEN t1.name = '单品' THEN '' ELSE m.model_sn END ) AS model_sn,
		( CASE WHEN s.`remark` is null THEN '' ELSE s.remark END ) AS remark,
		( CASE WHEN t1.name = '单品' THEN CONCAT(t3.NAME,'(单品)') ELSE m.NAME END ) AS NAME,
		( CASE WHEN t1.name = '单品' THEN '项' ELSE m.unit END ) AS model_unit,
		s.unit_price,s.qty,s.price,s.original_price,s.real_qty,m.pcs_qty,
		COALESCE(p.sku_price,0) as sku_price,COALESCE(p.artificial_price,0) as artificial_price,
		COALESCE(p.sku_original_price,0) as sku_original_price,COALESCE(p.artificial_original_price,0) as artificial_original_price,
		( CASE WHEN t1.name = '单品' THEN t1.picture ELSE m.picture END ) as picture,
		( CASE WHEN t1.name = '单品' THEN '' ELSE m.spec END ) as spec,
		( CASE WHEN t1.name = '单品' THEN '' ELSE m.color END ) as color,
		( CASE WHEN t1.name = '单品' THEN '' ELSE m.texture END ) as texture,
		( CASE WHEN t1.name = '单品' THEN '' ELSE m.remark END ) AS model_remark,
		( CASE WHEN t1.name = '单品' THEN t4.sort_index ELSE m.sort_index END ) AS sort_index,t4.`sort_index` second_sort_index,
		t2.id AS parent_tag,t2.NAME AS parent_tag_name,t2.sort_index AS parent_sort_index,
		t4.id AS tag,t4.Name AS tag_name
	FROM
		scheme_item s
		JOIN model_info m ON s.model_id = m.id
		JOIN model_tag t1 ON m.tag = t1.id
		JOIN model_tag t2 ON cast( substring( t1.`path`, 2, 3 ) AS UNSIGNED )= t2.`id`
		left JOIN model_tag t3 ON t1.parent_id = t3.id and t3.`is_deleted` = 0
		JOIN model_tag t4 ON cast( substring( t1.`path`, 6, 3 ) AS UNSIGNED )= t4.`id`
		LEFT JOIN (
			SELECT q.scheme_item_id,
				SUM(CASE WHEN q.purchase_type = 50 OR q.purchase_type = 99 THEN 0 ELSE q.sku_qty * q.sku_unit_price END) AS sku_price,
				SUM(CASE WHEN q.purchase_type = 50 OR q.purchase_type = 99 THEN q.sku_qty * q.sku_unit_price ELSE 0 END) AS artificial_price,
				SUM(CASE WHEN q.purchase_type = 50 OR q.purchase_type = 99 THEN 0 ELSE q.sku_qty * q.sku_original_price END) AS sku_original_price,
				SUM(CASE WHEN q.purchase_type = 50 OR q.purchase_type = 99 THEN q.sku_qty * q.sku_original_price ELSE 0 END) AS artificial_original_price
			FROM quote_detail q
			WHERE q.scheme_item_id IN (SELECT si.id FROM scheme_item si WHERE si.scheme_id = 2125121801040719874 AND si.is_deleted = 0)
			GROUP BY q.scheme_item_id
		) p ON p.scheme_item_id = s.id
	WHERE
		s.is_deleted = 0
		AND s.scheme_id = 2125121801040719874
	) AS t
 group by scheme_id ,model_id,model_sn,name,model_unit,picture,spec,color,texture,model_remark,parent_tag,parent_tag_name,parent_sort_index,
 tag,tag_name,parent_sort_index,sort_index, unit_price,pcs_qty
 order by parent_sort_index,second_sort_index,sort_index