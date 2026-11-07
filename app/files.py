"""Managed local attachments. No OCR, scripts, macros, or remote services."""
import hashlib
import io
import json
from pathlib import Path
import uuid
import zipfile
import xml.etree.ElementTree as ET

MAX_BYTES = 15 * 1024 * 1024
MIMES = {'.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
         '.pdf': 'application/pdf', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}


def save_document(root, filename, data):
    from store import ValidationError
    if not isinstance(filename, str) or not filename or len(filename) > 160 or any(c in filename for c in '/\\\x00:') or filename in ('.', '..'):
        raise ValidationError('文件名不合法')
    ext = Path(filename).suffix.lower()
    if ext not in MIMES or not data or len(data) > MAX_BYTES:
        raise ValidationError('仅支持 15MB 以内的 PNG、JPG、PDF、DOCX')
    warnings, extracted = [], ''
    try:
        if ext in ('.png', '.jpg', '.jpeg'):
            from PIL import Image
            with Image.open(io.BytesIO(data)) as img:
                if img.width * img.height > 30_000_000:
                    raise ValueError('图片像素过大')
                if img.format not in ('PNG', 'JPEG'):
                    raise ValueError('图片类型不符')
                img.verify()
            warnings.append('图片已本地保存，尚未自动识别；请人工录入或导入已核对的结构化草稿。')
        elif ext == '.docx':
            with zipfile.ZipFile(io.BytesIO(data)) as z:
                entries = z.infolist()
                if len(entries) > 3000 or sum(i.file_size for i in entries) > 40 * 1024 * 1024:
                    raise ValueError('文档展开量超限')
                for i in entries:
                    if '\\' in i.filename or i.filename.startswith('/') or '..' in i.filename.split('/') or i.file_size > 8 * 1024 * 1024:
                        raise ValueError('文档内部路径或大小异常')
                    if i.filename.endswith(('.xml', '.rels')):
                        xml = z.read(i)
                        if b'<!DOCTYPE' in xml.upper() or b'<!ENTITY' in xml.upper():
                            raise ValueError('不接受带实体声明的文档')
                if '[Content_Types].xml' not in z.namelist():
                    raise ValueError('不是真正的 DOCX')
                tree = ET.fromstring(z.read('word/document.xml'))
                extracted = '\n'.join(''.join(t.text or '' for t in p.iter() if t.tag.endswith('}t')) for p in tree.iter() if p.tag.endswith('}p'))[:100000]
                warnings.append('仅提取文字辅助核对；数学公式、图片和版式请对照原文，未自动判题。')
        else:
            if not data.startswith(b'%PDF-'):
                raise ValueError('PDF 文件头不符')
            from pypdf import PdfReader
            reader = PdfReader(io.BytesIO(data))
            if reader.is_encrypted or len(reader.pages) > 100:
                raise ValueError('不支持加密或超过100页的PDF')
            extracted = '\n'.join((p.extract_text() or '')[:10000] for p in reader.pages)[:100000]
            warnings.append('PDF 文字提取不等于公式或手写识别；扫描页需人工核对。')
            if '\ufffd' in extracted:
                warnings.append('文字层含替换字符，请以原页为准。')
    except Exception as exc:
        raise ValidationError('文件无法安全读取：' + str(exc)[:150]) from exc
    folder = Path(root) / 'documents'
    folder.mkdir(parents=True, exist_ok=True)
    ident = uuid.uuid4().hex
    meta = dict(id=ident, filename=filename, storage_name=ident + ext, mime=MIMES[ext],
                size=len(data), sha256=hashlib.sha256(data).hexdigest(), extracted_text=extracted, warnings=warnings)
    (folder / meta['storage_name']).write_bytes(data)
    (folder / (ident + '.json')).write_text(json.dumps(meta, ensure_ascii=False), encoding='utf-8')
    return meta


def get_document(root, ident):
    from store import ValidationError
    if not isinstance(ident, str) or len(ident) != 32 or any(c not in '0123456789abcdef' for c in ident):
        raise ValidationError('附件编号无效')
    p = Path(root) / 'documents' / (ident + '.json')
    if not p.is_file():
        raise ValidationError('附件不存在')
    meta = json.loads(p.read_text(encoding='utf-8'))
    if meta.get('id') != ident or meta.get('storage_name') != ident + Path(meta.get('filename', '')).suffix.lower():
        raise ValidationError('附件索引损坏')
    return meta, p.parent / meta['storage_name']
