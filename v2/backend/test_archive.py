import io
import tempfile
import unittest
from pathlib import Path

from PIL import Image

from backend.archive import ArchiveStore, extract_question_numbers, slug_name
from backend.main import ChatInput, create_app


class ArchiveStoreTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.store = ArchiveStore(Path(self.temp.name) / 'archive')

    def tearDown(self):
        self.temp.cleanup()

    def test_slug_and_question_numbers(self):
        self.assertEqual(slug_name(' 王小明 '), '王小明')
        self.assertEqual(extract_question_numbers('第3、5、8题错'), ['3', '5', '8'])
        with self.assertRaises(ValueError):
            slug_name('CON')

    def test_create_on_confirm_and_rename_duplicate(self):
        pending = self.store.resolve_student('王小明')
        self.assertEqual(pending['status'], 'needs_create')
        first = self.store.resolve_student('王小明', confirm_new=True)
        self.assertEqual(first['status'], 'created')
        again = self.store.resolve_student('王小明')
        self.assertEqual(again['status'], 'existing')
        second = self.store.resolve_student('王小明', confirm_new=True)
        self.assertEqual(second['student']['name'], '王小明2')

    def test_save_and_reload_latest_markdown(self):
        student = self.store.resolve_student('李华', confirm_new=True)['student']
        png = io.BytesIO()
        Image.new('RGB', (8, 6), 'navy').save(png, 'PNG')
        saved = self.store.save_task(
            student['id'],
            'math',
            [('作业第1页.png', png.getvalue())],
            teacher_note='第3、5题错',
        )
        self.assertEqual(saved['file_count'], 1)
        self.assertEqual(saved['questions'], ['3', '5'])
        latest = self.store.latest(student['id'], 'math')
        self.assertTrue(latest['exists'])
        self.assertIn('第3题', latest['markdown'])
        self.assertIn('李华 · 数学', latest['markdown'])
        english = self.store.latest(student['id'], 'english')
        self.assertFalse(english['exists'])
        self.assertIn('尚无材料', english['markdown'])

    def test_rejects_empty_and_unknown_subject(self):
        student = self.store.resolve_student('张三', confirm_new=True)['student']
        with self.assertRaises(ValueError):
            self.store.save_task(student['id'], 'math', [])
        with self.assertRaises(KeyError):
            self.store.save_task(student['id'], 'chinese', [('a.png', b'abc')])

    def test_fast_successive_uploads_preserve_both_originals(self):
        student = self.store.resolve_student('虚构甲', confirm_new=True)['student']
        first = self.store.save_task(student['id'], 'math', [('same.png', b'first')])
        second = self.store.save_task(student['id'], 'math', [('same.png', b'second')])
        self.assertNotEqual(first['assignment_id'], second['assignment_id'])
        folder = self.store.subject_dir(student['id'], 'math') / 'originals'
        self.assertEqual((folder / first['assignment_id'] / '01-same.png').read_bytes(), b'first')
        self.assertEqual((folder / second['assignment_id'] / '01-same.png').read_bytes(), b'second')

    def test_invalid_second_file_leaves_no_partial_upload(self):
        student = self.store.resolve_student('虚构甲', confirm_new=True)['student']
        with self.assertRaises(ValueError):
            self.store.save_task(student['id'], 'math', [('valid.png', b'first'), ('empty.png', b'')])
        self.assertEqual(list(self.store.root.rglob('01-valid.png')), [])


class ArchiveApiTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        root = Path(self.temp.name)
        self.app = create_app(root / 'probe.sqlite3', root / 'archive')

    def tearDown(self):
        self.temp.cleanup()

    def test_four_subjects_and_first_cut_loop(self):
        names = {getattr(route, 'path', None) for route in self.app.router.routes}
        self.assertIn('/api/subjects', names)
        self.assertIn('/api/students/{student_id}/subjects/{subject}/assignments', names)
        archive = ArchiveStore(self.temp.name and Path(self.temp.name) / 'archive')
        self.assertEqual([item['id'] for item in archive.list_subjects()], ['math', 'english', 'physics', 'chemistry'])
        pending = archive.resolve_student('王小明')
        self.assertEqual(pending['status'], 'needs_create')
        created = archive.resolve_student('王小明', confirm_new=True)
        student_id = created['student']['id']
        png = io.BytesIO()
        Image.new('RGB', (12, 10), 'teal').save(png, 'PNG')
        saved = archive.save_task(student_id, 'math', [('page1.png', png.getvalue())], '今天作业，第3、5、8题错')
        self.assertEqual(saved['questions'], ['3', '5', '8'])
        latest = archive.latest(student_id, 'math')
        self.assertTrue(latest['exists'])
        payload = ChatInput(text='上次错在哪', image_count=0, imported_summary=latest['markdown'])
        chat = next(route.endpoint for route in self.app.router.routes if getattr(route, 'path', None) == '/api/chat')
        reply = chat(payload)
        self.assertIn('已导入该生该科最新摘要', reply['text'])
        self.assertFalse(archive.latest(student_id, 'physics')['exists'])


if __name__ == '__main__':
    unittest.main()
