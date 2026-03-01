# Dosya: tahmin.R
args <- commandArgs(trailingOnly = TRUE)
veriler <- as.numeric(unlist(strsplit(args[1], ",")))
secilen_model <- args[2] # Arayüzden gelen model adı ("ARIMA", "ETS", "NNETAR", "AUTO")

tryCatch({
    library(forecast)
    zaman_serisi <- ts(veriler, frequency = 12)
    
    # Seçilen modele göre tahmin yapma fonksiyonu
    tahmin_yap <- function(seri, model_tipi) {
        if(model_tipi == "ARIMA") {
            fit <- auto.arima(seri)
            return(forecast(fit, h=1)$mean)
            
        } else if(model_tipi == "ETS") {
            fit <- ets(seri)
            return(forecast(fit, h=1)$mean)
            
        } else if(model_tipi == "NNETAR") {
            fit <- nnetar(seri)
            return(forecast(fit, h=1)$mean)
            
        } else if(model_tipi == "AUTO") {
            # BÜYÜK ŞOV: Hepsini kur, Hata Payı (RMSE) en düşük olanı seç!
            fit_arima <- auto.arima(seri)
            fit_ets <- ets(seri)
            fit_nnetar <- nnetar(seri)
            
            acc_arima <- accuracy(fit_arima)[1, "RMSE"]
            acc_ets <- accuracy(fit_ets)[1, "RMSE"]
            acc_nnetar <- accuracy(fit_nnetar)[1, "RMSE"]
            
            min_rmse <- min(acc_arima, acc_ets, acc_nnetar)
            
            if(min_rmse == acc_arima) return(forecast(fit_arima, h=1)$mean)
            if(min_rmse == acc_ets) return(forecast(fit_ets, h=1)$mean)
            if(min_rmse == acc_nnetar) return(forecast(fit_nnetar, h=1)$mean)
        }
    }
    
    # Tahmini çalıştır ve sadece sayıyı yazdır
    sonuc <- tahmin_yap(zaman_serisi, secilen_model)
    cat(as.numeric(sonuc))
    
}, error = function(e) {
    cat(mean(veriler)) 
})