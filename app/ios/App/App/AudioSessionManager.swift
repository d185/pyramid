import Foundation
import AVFoundation
import UIKit

/// Управление звуком телефона — то, чего Safari не даёт.
///
/// В браузере WebKit сам угадывает режим звука: включился микрофон — значит
/// звонок, и звук уходит в разговорный динамик у уха, музыка приглушается,
/// движок страницы засыпает между касаниями. Здесь мы задаём режим явно:
/// запись и воспроизведение одновременно, вывод в громкий динамик, музыка
/// и голос не глушат друг друга, звук живёт при заблокированном экране,
/// а после телефонного звонка или будильника сам возвращается.
final class AudioSessionManager {
    static let shared = AudioSessionManager()
    private var configured = false

    func configure() {
        let session = AVAudioSession.sharedInstance()
        do {
            // .playAndRecord — микрофон и динамик вместе.
            // .defaultToSpeaker — в громкий динамик, а не в разговорный у уха.
            // .allowBluetooth / A2DP — наушники и колонки по Bluetooth.
            // .mixWithOthers — не рвём звук других приложений без нужды.
            try session.setCategory(.playAndRecord,
                                    mode: .default,
                                    options: [.defaultToSpeaker, .allowBluetooth, .allowBluetoothA2DP, .mixWithOthers])
            try session.setPreferredSampleRate(48000)
            try session.setPreferredIOBufferDuration(0.02)
            try session.setActive(true, options: [])
            configured = true
        } catch {
            NSLog("Pyramid: не удалось настроить звук: \(error)")
        }
        if !configured { return }
        let nc = NotificationCenter.default
        nc.addObserver(self, selector: #selector(onInterruption(_:)),
                       name: AVAudioSession.interruptionNotification, object: session)
        nc.addObserver(self, selector: #selector(onRouteChange(_:)),
                       name: AVAudioSession.routeChangeNotification, object: session)
        nc.addObserver(self, selector: #selector(onMediaReset(_:)),
                       name: AVAudioSession.mediaServicesWereResetNotification, object: session)
        nc.addObserver(self, selector: #selector(reactivate),
                       name: UIApplication.didBecomeActiveNotification, object: nil)
    }

    /// Телефонный звонок, Siri, будильник — после них звук надо вернуть самим
    @objc private func onInterruption(_ note: Notification) {
        guard let info = note.userInfo,
              let raw = info[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: raw) else { return }
        if type == .ended { reactivate() }
    }

    /// Выдернули наушники — вернуть вывод в громкий динамик
    @objc private func onRouteChange(_ note: Notification) {
        guard let info = note.userInfo,
              let raw = info[AVAudioSessionRouteChangeReasonKey] as? UInt,
              let reason = AVAudioSession.RouteChangeReason(rawValue: raw) else { return }
        if reason == .oldDeviceUnavailable || reason == .categoryChange { reactivate() }
    }

    /// Система перезапустила звуковой сервис — настраиваем заново
    @objc private func onMediaReset(_ note: Notification) {
        configured = false
        configure()
    }

    @objc func reactivate() {
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setActive(true, options: [])
            // если WebKit на время звонка переключил вывод в разговорный динамик — возвращаем
            if session.currentRoute.outputs.contains(where: { $0.portType == .builtInReceiver }) {
                try session.overrideOutputAudioPort(.speaker)
            }
        } catch {
            NSLog("Pyramid: не удалось вернуть звук: \(error)")
        }
    }
}
