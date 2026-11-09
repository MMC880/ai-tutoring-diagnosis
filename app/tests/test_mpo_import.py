"""Real MPO bytes named .jpg, matching the reported import rejection."""
import io
from pathlib import Path
import sys
import tempfile
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from PIL import Image
from files import save_document, get_document
from store import Store, ValidationError
from photo_progress import photo_progress
import vision


def mpo_bytes():
    output=io.BytesIO()
    Image.new('RGB',(160,120),'red').save(output,format='MPO',save_all=True,
        append_images=[Image.new('RGB',(160,120),'blue')])
    return output.getvalue()


class MpoImportTests(unittest.TestCase):
    def test_mpo_jpg_keeps_original_and_previews_primary_frame(self):
        raw=mpo_bytes()
        with Image.open(io.BytesIO(raw)) as check:
            self.assertEqual(check.format,'MPO');self.assertEqual(check.n_frames,2)
        with tempfile.TemporaryDirectory() as root:
            doc=save_document(root,'wechat-photo.jpg',raw)
            self.assertEqual(get_document(root,doc['id'])[1].read_bytes(),raw)
            self.assertEqual(doc['mime'],'image/jpeg')
            self.assertEqual(doc['image_format'],'MPO');self.assertEqual(doc['frame_count'],2)
            self.assertTrue(any('主图' in warning for warning in doc['warnings']))
            with Image.open(io.BytesIO(vision.preview_document(root,doc['id']))) as preview:
                self.assertEqual(preview.format,'PNG')
                r,g,b=preview.getpixel((80,60));self.assertGreater(r,200);self.assertLess(b,30)
            store=Store(root)
            paper=store.create_paper(dict(student_ref='SYN-MPO',batch_id='SYN-MPO',title='合成',documents=[doc],
                questions=[dict(id='Q01',stem='1+1',answer='2',result='CORRECT')]))
            self.assertEqual(photo_progress(store,paper['id'])['total_images'],1)
            store.restore(store.backup()['id'],'RESTORE')
            self.assertEqual(get_document(root,doc['id'])[1].read_bytes(),raw)

    def test_truncated_mpo_primary_is_rejected_without_saving(self):
        raw=mpo_bytes()
        with Image.open(io.BytesIO(raw)) as check:
            primary_size=check.mpinfo[0xB002][0]['Size']
        with tempfile.TemporaryDirectory() as root:
            with self.assertRaises(ValidationError):
                save_document(root,'broken-mpo.jpg',raw[:primary_size-50])
            self.assertFalse((Path(root)/'documents').exists())
