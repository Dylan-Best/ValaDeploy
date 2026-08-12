import json
import subprocess
from pathlib import Path
from tempfile import TemporaryDirectory

def scan_image(image_name: str) -> dict:
    """
    Scan a Docker image for vulnerabilities using Trivy.

    Args:
        image_name (str): The name of the Docker image to scan.

    Returns:
        dict: A dictionary containing the scan results.
    """
    scan = subprocess.run(['trivy', 'image', '--format', 'json', image_name], capture_output=True, text=True)

    if scan.returncode != 0:
        raise ValueError(f"Error occurred while scanning image: {scan.stderr}")

    scan_results = json.loads(scan.stdout)

    severity_count = {}
    for result in scan_results.get('Results', []):
        for vulnerability in result.get('Vulnerabilities', []):
            severity = vulnerability.get('Severity', 'UNKNOWN') 
            severity_count[severity] = severity_count.get(severity, 0) + 1
            
    
    return {
        "severity_count": severity_count,
        "blocking" : severity_count.get('CRITICAL', 0) > 0 
    }
    


def detect_secret(project_path: str) -> dict:
    with TemporaryDirectory(prefix="gitleaks_") as tmp_dir:
        report_file = Path(tmp_dir) / "report.json"

        cmd = [
            "gitleaks",
            "detect",
            "--source",
            str(project_path),
            "--report-format",
            "json",
            "--report-path",
            str(report_file),
            "--exit-code=0",
        ]

        scan = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
        )

        if scan.returncode != 0:
            raise ValueError(
                f"Error occurred while scanning project: {scan.stderr}"
            )

        if report_file.is_file() and report_file.stat().st_size > 0:
            with report_file.open("r", encoding="utf-8") as file:
                secrets = json.load(file)

            if secrets:
                first_secret = secrets[0]

                return {
                    "blocking": True,
                    "secret_count": len(secrets),
                    "secret_found": {
                        "rule_id": first_secret.get("RuleID"),
                        "description": first_secret.get("Description"),
                        "file": first_secret.get("File"),
                        "line": first_secret.get("StartLine"),
                        "value": first_secret.get("Secret"),
                    },
                }

        return {
            "blocking": False,
            "secret_found": None,
        }