import unittest

from serve_https import is_forbidden_path


class HttpsServerPathTests(unittest.TestCase):
    def test_private_and_generated_paths_are_blocked(self):
        for path in ("/key.pem", "/cert.pem", "/.git/config", "/output/report.png", "/node_modules/pkg/file.js"):
            with self.subTest(path=path):
                self.assertTrue(is_forbidden_path(path))

    def test_encoded_hidden_paths_are_blocked_but_app_files_are_served(self):
        self.assertTrue(is_forbidden_path("/%2egit/config"))
        self.assertFalse(is_forbidden_path("/ghn_mobile.html"))
        self.assertFalse(is_forbidden_path("/js/p2p-sync.js"))


if __name__ == "__main__":
    unittest.main()
