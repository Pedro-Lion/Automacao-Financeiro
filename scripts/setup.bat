@echo off
setlocal
if not exist config.yaml copy config.example.yaml config.yaml
if not exist data mkdir data
if not exist data\tmp mkdir data\tmp
if not exist logs mkdir logs
call npm install
python -m pip install -r requirements.txt
echo SAPA configurado. Edite config.yaml antes da primeira execução.
