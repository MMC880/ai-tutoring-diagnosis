"""Keep SQLite test files inside this workspace, not a Windows sandbox virtual TEMP."""
from pathlib import Path
import tempfile
import unittest

root = Path(__file__).resolve().parents[1]
folder = root / '.qa-temp'
folder.mkdir(exist_ok=True)
tempfile.tempdir = str(folder)
result = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.discover(str(root / 'tests')))
raise SystemExit(not result.wasSuccessful())
