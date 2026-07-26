import os
import tempfile
import unittest
from io import BytesIO
from unittest.mock import patch

from PIL import Image

from upload_utils import delete_photo, save_photo_bytes


class LocalUploadStorageTests(unittest.TestCase):
    def test_local_save_uses_real_jpeg_and_can_be_deleted(self):
        source = BytesIO()
        Image.new('RGBA', (48, 32), (80, 140, 220, 180)).save(source, 'PNG')

        with tempfile.TemporaryDirectory() as folder:
            with patch.dict(os.environ, {'CLOUDINARY_URL': ''}, clear=False):
                filename = save_photo_bytes(
                    source.getvalue(),
                    folder,
                    filename_prefix='test_',
                )

                self.assertTrue(filename.endswith('.jpg'))
                filepath = os.path.join(folder, filename)
                self.assertTrue(os.path.exists(filepath))
                with Image.open(filepath) as image:
                    self.assertEqual(image.format, 'JPEG')

                delete_photo(filename, folder)
                self.assertFalse(os.path.exists(filepath))


if __name__ == '__main__':
    unittest.main()
