import io
import tempfile
import unittest
from pathlib import Path
from fastapi.testclient import TestClient
from PIL import Image
from backend.main import create_app


class EnvironmentTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.client = TestClient(create_app(Path(self.temp.name) / 'probe.sqlite3'))

    def tearDown(self):
        self.client.close()
        self.temp.cleanup()

    def test_health_sqlite_and_chinese_skill(self):
        self.assertEqual(self.client.get('/health').json()['mode'], 'synthetic-only')
        self.assertEqual(self.client.post('/api/sqlite-probe').json()['value'], '中文读写验证')
        skill = self.client.get('/api/skill').json()
        self.assertEqual(skill['display_name'], '数学错题复盘')
        self.assertIn('单次错误', skill['instructions'])

    def test_chat_uses_local_simulation(self):
        response = self.client.post('/api/chat', json={'text': '检查环境', 'image_count': 0})
        self.assertEqual(response.status_code, 200)
        self.assertIn('本地模拟', response.json()['text'])
        self.assertEqual(self.client.post('/api/chat', json={'text': ''}).status_code, 422)

    def test_images_validated_not_extension_only(self):
        data = io.BytesIO()
        Image.new('RGB', (32, 24), 'teal').save(data, 'PNG')
        response = self.client.post('/api/images', files={'file': ('中文.jpg', data.getvalue(), 'image/jpeg')})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['format'], 'PNG')
        self.assertEqual(self.client.post('/api/images', files={'file': ('bad.png', b'not an image', 'image/png')}).status_code, 422)

    def test_foreign_host_rejected(self):
        self.assertEqual(self.client.get('/health', headers={'host': 'untrusted.example'}).status_code, 400)


if __name__ == '__main__':
    unittest.main()
