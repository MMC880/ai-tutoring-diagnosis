import io
import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient
from PIL import Image

from backend.main import create_app
from backend.provider import image_content


class AnalysisImageTests(unittest.TestCase):
    def test_large_camera_original_gets_bounded_metadata_free_copy(self):
        with tempfile.TemporaryDirectory() as folder:
            client = TestClient(create_app(archive_root=Path(folder)))
            image = Image.effect_noise((2400, 2000), 100).convert('RGB')
            out = io.BytesIO()
            image.save(out, 'PNG', pnginfo=None)
            original = out.getvalue()
            self.assertGreater(len(original), 2 * 1024 * 1024)
            result = client.post('/api/intake/analysis-image', files={'file': ('camera.jpg', original)})
            self.assertEqual(result.status_code, 200, result.text)
            data = result.json()
            self.assertLessEqual(data['bytes'], 2 * 1024 * 1024)
            self.assertLessEqual(max(data['width'], data['height']), 2000)
            self.assertTrue(image_content(data['image']).startswith('data:image/png;base64,'))
            self.assertFalse(list(Path(folder).rglob('objects/*')))

    def test_unreadable_can_archive_but_not_be_claimed_as_analyzed(self):
        with tempfile.TemporaryDirectory() as folder, TestClient(create_app(archive_root=Path(folder))) as client:
            preview = client.post('/api/intake/inspect', files={'file': ('broken.jpg', b'broken')})
            self.assertEqual(preview.status_code, 200)
            result = client.post('/api/intake/analysis-image', files={'file': ('broken.jpg', b'broken')})
            self.assertEqual(result.status_code, 422)
            self.assertIn('仍可归档', result.text)
